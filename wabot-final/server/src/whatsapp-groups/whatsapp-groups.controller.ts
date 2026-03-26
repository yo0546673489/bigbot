import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { WhatsAppGroupsService } from './whatsapp-groups.service';
import { CreateWhatsAppGroupDto, UpdateWhatsAppGroupDto } from './whatsapp-groups.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('whatsapp-groups')
@Controller('whatsapp-groups')
@UseGuards(JwtAuthGuard)
export class WhatsAppGroupsController {
  constructor(private readonly groupsService: WhatsAppGroupsService) {}

  @Post()
  async create(@Body() createDto: CreateWhatsAppGroupDto) {
    return this.groupsService.create(createDto);
  }

  @Get()
  async findAll(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc',
  ) {
    return this.groupsService.getGroups({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get(':groupId')
  async findOne(@Param('groupId') groupId: string) {
    return this.groupsService.findOne(groupId);
  }

  @Put(':groupId')
  async update(@Param('groupId') groupId: string, @Body() updateDto: UpdateWhatsAppGroupDto) {
    return this.groupsService.update(groupId, updateDto);
  }

  @Delete(':groupId')
  async remove(@Param('groupId') groupId: string) {
    await this.groupsService.remove(groupId);
    return { deleted: true };
  }

  @Get('export/all')
  async exportAllGroupsToExcel(
    @Res() res: Response,
    @Query('batchSize') batchSize = 100
  ) {
    try {
      const groupsGenerator = this.groupsService.findAllWithParticipants(Number(batchSize));
      let totalGroups = 0;
      let processedGroups = 0;
      let hasGroups = false;

      // First, get the total count for progress tracking
      try {
        totalGroups = await this.groupsService.countAllGroups();
      } catch (error) {
        console.warn('Could not get total group count, progress will not be accurate');
      }

      // Create a new workbook
      const wb = XLSX.utils.book_new();
      const formattedDate = new Date().toISOString().split('T')[0];
      
      // Create a map to store phone numbers and their groups
      const phoneMap = new Map<string, Set<string>>();
      const allGroups = new Set<string>();

      // Process groups in batches
      for await (const batch of groupsGenerator) {
        if (!hasGroups) hasGroups = batch.length > 0;
        
        for (const group of batch) {
          processedGroups++;
          const groupName = group.name || `Group_${group.groupId || processedGroups}`;
          allGroups.add(groupName);
          
          // Skip groups without participants
          if (!group.participants?.length) continue;

          // Process each participant in the group
          for (const participant of group.participants) {
            // Extract phone number from jid and remove @s.whatsapp.net
            const phoneNumber = participant.phoneNumber.includes('@') ? participant.phoneNumber.split('@')[0] : participant.phoneNumber;
            if (!phoneNumber) continue;
            
            if (!phoneMap.has(phoneNumber)) {
              phoneMap.set(phoneNumber, new Set());
            }
            phoneMap.get(phoneNumber)?.add(groupName);
          }

          // Log progress
          if (totalGroups > 0) {
            const progress = Math.round((processedGroups / totalGroups) * 100);
            console.log(`Processing: ${progress}% (${processedGroups}/${totalGroups} groups)`);
          }
        }
      }

      if (!hasGroups) {
        return res.status(404).json({ message: 'No groups found' });
      }

      // Prepare data for the worksheet
      const worksheetData = [
        ['Phone Number', 'Groups'] // Header row
      ];

      // Add rows for each phone number with comma-separated group names
      for (const [phoneNumber, groups] of phoneMap.entries()) {
        const groupList = Array.from(groups).sort().join(', ');
        worksheetData.push([phoneNumber, groupList]);
      }

      // Create and style the worksheet
      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      
      // Set column widths
      const colWidths = [
        { wch: 20 }, // Phone Number column
        { wch: 50 }  // Groups column (wider to accommodate multiple group names)
      ];
      ws['!cols'] = colWidths;
      
      // Style the header row
      const headerRow = 0;
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: C });
        if (!ws[cellAddress]) continue;
        
        ws[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: 'F2F2F2' } },
          alignment: { horizontal: 'center' }
        };
      }

      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Group Members');

      // Generate Excel file
      const excelBuffer = XLSX.write(wb, { 
        bookType: 'xlsx', 
        type: 'buffer',
        bookSST: false,
        compression: true
      });
      
      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="all_groups_export_${formattedDate}.xlsx"`
      );

      // Send the Excel file
      return res.send(excelBuffer);
      
    } catch (error) {
      console.error('Error exporting all groups:', error);
      return res.status(500).json({ 
        message: 'Failed to export groups',
        error: error.message 
      });
    }
  }
}
