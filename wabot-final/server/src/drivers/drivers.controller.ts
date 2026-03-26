import { Controller, Get, Query, UseGuards, Patch, Param, Body, Post, Delete  } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { GetDriversDto } from './dto/get-drivers.dto';
import { PaginatedDriversResponse } from './dto/get-drivers-response.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { Driver } from './schemas/driver.schema';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@ApiTags('drivers')
@Controller('drivers')
@UseGuards(JwtAuthGuard)
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of drivers' })
  @ApiResponse({ 
    status: 200, 
    description: 'Returns paginated list of drivers',
    type: PaginatedDriversResponse
  })
  @ApiQuery({ name: 'search', required: false, description: 'Search in name, phone, or vehicle number' })
  @ApiQuery({ 
    name: 'vehicle', 
    required: false, 
    description: 'Filter by vehicle'
  })
  @ApiQuery({ 
    name: 'clothing', 
    required: false, 
    description: 'Filter by clothing type'
  })
  @ApiQuery({ 
    name: 'isApproved', 
    required: false, 
    type: Boolean,
    description: 'Filter by approval status'
  })
  @ApiQuery({ 
    name: 'isActive', 
    required: false, 
    type: Boolean,
    description: 'Filter by active status'
  })
  @ApiQuery({ 
    name: 'sortBy', 
    required: false, 
    enum: ['name', 'phone', 'vehicleType', 'isApproved', 'isActive', 'createdAt', 'updatedAt'],
    description: 'Field to sort by'
  })
  @ApiQuery({ 
    name: 'sortOrder', 
    required: false, 
    enum: ['asc', 'desc'],
    description: 'Sort order'
  })
  @ApiQuery({ 
    name: 'page', 
    required: false, 
    type: Number,
    description: 'Page number (min: 1)'
  })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number,
    description: 'Items per page (min: 1, max: 100)'
  })
  async getDrivers(@Query() query: GetDriversDto): Promise<PaginatedDriversResponse> {
    return this.driversService.findAll(query);
  }

  @Patch(':phone')
  async updateDriver(
    @Param('phone') phone: string,
    @Body() updateDriverDto: UpdateDriverDto,
  ): Promise<Driver> {
    return this.driversService.updateDriver(phone, updateDriverDto);
  }

  @Post(':phone/message')
  async sendMessage(
    @Param('phone') phone: string,
    @Body() sendMessageDto: SendMessageDto,
  ): Promise<{ success: boolean }> {
    return this.driversService.sendMessage(phone, sendMessageDto.message);
  }

  @Post(':phone/approve')
  async sendApprovalMessage(
    @Param('phone') phone: string,
  ): Promise<Driver> {
    return this.driversService.sendApprovalMessage(phone);
  }

  @Delete(':phone')
  async deleteDriver(@Param('phone') phone: string): Promise<{ success: boolean }> {
    return this.driversService.deleteDriver(phone);
  }
} 