package com.bigbot.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.GroupsFilterViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupsFilterScreen(
    onBack: () -> Unit,
    viewModel: GroupsFilterViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val filteredGroups by viewModel.filteredGroups.collectAsState()
    val totalCount by viewModel.totalCount.collectAsState()
    val blacklistedCount by viewModel.blacklistedCount.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFFAFCFA))
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(CardBg)
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "חזור",
                        tint = GreenDark
                    )
                }
                Spacer(Modifier.width(4.dp))
                Column {
                    Text("סינון קבוצות", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = GreenDark)
                    Text("בחר קבוצות שלא יסרקו", fontSize = 12.sp, color = TextSecondary)
                }
            }
        }
        HorizontalDivider(color = Border, thickness = 0.5.dp)

        when {
            uiState.isLoading -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = Primary)
                        Spacer(Modifier.height(12.dp))
                        Text("טוען קבוצות...", fontSize = 13.sp, color = TextSecondary)
                    }
                }
            }
            uiState.error != null -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(32.dp)
                    ) {
                        Text("⚠️", fontSize = 48.sp)
                        Spacer(Modifier.height(12.dp))
                        Text(
                            uiState.error!!,
                            fontSize = 14.sp,
                            color = TextSecondary,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.refresh() },
                            colors = ButtonDefaults.buttonColors(containerColor = Primary),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("רענן")
                        }
                    }
                }
            }
            uiState.groups.isEmpty() -> {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("📭", fontSize = 48.sp)
                        Spacer(Modifier.height(12.dp))
                        Text("אין קבוצות להצגה", fontSize = 14.sp, color = TextSecondary)
                    }
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(0.dp)
                ) {
                    // Search bar
                    item {
                        OutlinedTextField(
                            value = uiState.searchQuery,
                            onValueChange = { viewModel.setSearchQuery(it) },
                            placeholder = { Text("חפש קבוצה...", fontSize = 13.sp) },
                            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextSecondary) },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Primary,
                                unfocusedBorderColor = Border,
                                focusedContainerColor = CardBg,
                                unfocusedContainerColor = CardBg
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 8.dp)
                        )
                    }

                    // Info text
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(GreenBg)
                                .padding(12.dp)
                        ) {
                            Text(
                                "ⓘ סמן קבוצות שלא תרצה שיסרקו. הודעות מהקבוצות שתסמן לא יעובדו על ידי הבוט.",
                                fontSize = 11.sp,
                                color = GreenDark
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                    }

                    // Counter
                    item {
                        HorizontalDivider(color = Border, thickness = 0.5.dp)
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "$totalCount קבוצות · $blacklistedCount מוחרגות",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = TextSecondary
                            )
                        }
                        HorizontalDivider(color = Border, thickness = 0.5.dp)
                    }

                    // Groups list
                    items(filteredGroups, key = { it.groupId }) { group ->
                        GroupRow(
                            group = group,
                            onToggle = { viewModel.toggleBlacklist(group.groupId) }
                        )
                        HorizontalDivider(color = DividerColor, thickness = 0.5.dp)
                    }

                    // Bottom spacer
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun GroupRow(
    group: GroupsFilterViewModel.GroupItem,
    onToggle: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onToggle() }
            .padding(vertical = 10.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = group.isBlacklisted,
            onCheckedChange = { onToggle() },
            colors = CheckboxDefaults.colors(
                checkedColor = AppRed,
                uncheckedColor = TextSecondary
            )
        )
        Spacer(Modifier.width(4.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                group.name,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = if (group.isBlacklisted) TextSecondary else TextPrimary
            )
            Row {
                Text(
                    "${group.memberCount} משתתפים",
                    fontSize = 10.sp,
                    color = TextSecondary
                )
                if (group.isBlacklisted) {
                    Text(
                        " · לא נסרקת",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = AppRed
                    )
                }
            }
        }
    }
}
