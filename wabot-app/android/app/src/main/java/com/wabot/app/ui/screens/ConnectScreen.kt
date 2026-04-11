package com.wabot.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.wabot.app.ui.viewmodel.ConnectViewModel

@Composable
fun ConnectScreen(
    onConnected: () -> Unit,
    viewModel: ConnectViewModel = hiltViewModel()
) {
    var phoneInput by remember { mutableStateOf("972") }
    var nameInput by remember { mutableStateOf("") }
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "ביגבוט",
            fontSize = 36.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            "מערכת נסיעות חכמה לנהגים",
            fontSize = 14.sp,
            color = Color.Gray
        )

        Spacer(Modifier.height(48.dp))

        OutlinedTextField(
            value = nameInput,
            onValueChange = { nameInput = it },
            label = { Text("שם מלא") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = phoneInput,
            onValueChange = { phoneInput = it },
            label = { Text("מספר טלפון (972...)") },
            modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true
        )

        Spacer(Modifier.height(24.dp))

        if (error != null) {
            Text(
                error!!,
                color = Color.Red,
                fontSize = 14.sp
            )
            Spacer(Modifier.height(8.dp))
        }

        Button(
            onClick = {
                viewModel.connect(phoneInput, nameInput) {
                    onConnected()
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading && phoneInput.isNotBlank() && nameInput.isNotBlank()
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = Color.White
                )
            } else {
                Text("התחבר", fontSize = 16.sp)
            }
        }
    }
}
