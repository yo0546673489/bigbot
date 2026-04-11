package com.bigbot.app.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.bigbot.app.R
import com.bigbot.app.ui.theme.*
import com.bigbot.app.viewmodel.OnboardingStep
import com.bigbot.app.viewmodel.OnboardingViewModel

/**
 * Multi-step onboarding wizard:
 * Name → DOB → Vehicle → Phone → Pair → Done.
 *
 * Once finished, the user is fully registered on the server and can start
 * receiving rides automatically — no further setup required.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(
    onFinished: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel()
) {
    val step by viewModel.step.collectAsState()
    val name by viewModel.name.collectAsState()
    val dob by viewModel.dob.collectAsState()
    val vehicle by viewModel.vehicle.collectAsState()
    val phone by viewModel.phone.collectAsState()
    val error by viewModel.error.collectAsState()
    val isWorking by viewModel.isWorking.collectAsState()

    LaunchedEffect(step) {
        if (step == OnboardingStep.DONE) onFinished()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ברוכים הבאים ל-BigBot", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CardBg,
                    titleContentColor = GreenDark
                )
            )
        }
    ) { padding ->
        // Outer column pinned to the screen — inner scrollable content above,
        // action buttons stay pinned at the bottom. Fixes: small screens
        // couldn't reach the "המשך" button on the vehicle step because the
        // whole screen was non-scrollable.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(PageBg)
                .padding(padding),
        ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Progress indicator (4 steps: name → dob → vehicle → phone)
            val stepIndex = listOf(
                OnboardingStep.NAME,
                OnboardingStep.DOB,
                OnboardingStep.VEHICLE,
                OnboardingStep.PHONE
            ).indexOf(step).coerceAtLeast(0)
            // BigBot logo
            Image(
                painter = painterResource(R.drawable.logo_bigbot),
                contentDescription = "BigBot Logo",
                modifier = Modifier.size(80.dp),
                contentScale = ContentScale.Fit
            )
            Spacer(Modifier.height(8.dp))
            Text("BigBot", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = GreenDark)
            Spacer(Modifier.height(16.dp))
            LinearProgressIndicator(
                progress = { (stepIndex + 1) / 4f },
                modifier = Modifier.fillMaxWidth(),
                color = GreenDark
            )
            Spacer(Modifier.height(24.dp))

            when (step) {
                OnboardingStep.NAME -> {
                    StepHeader("שם מלא", "איך קוראים לך?")
                    OutlinedTextField(
                        value = name,
                        onValueChange = viewModel::setName,
                        label = { Text("שם פרטי + משפחה") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                OnboardingStep.DOB -> {
                    StepHeader("תאריך לידה", "מתי נולדת? (פורמט: DD/MM/YYYY)")
                    OutlinedTextField(
                        value = dob,
                        onValueChange = viewModel::setDob,
                        label = { Text("DD/MM/YYYY") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                OnboardingStep.VEHICLE -> {
                    StepHeader("סוג רכב", "איזה סוג רכב יש לך?")
                    val options = listOf("4 מקומות", "מיניק", "ויטו", "רכב גדול")
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        options.forEach { opt ->
                            VehicleChoice(
                                label = opt,
                                selected = vehicle == opt,
                                onClick = { viewModel.setVehicle(opt) }
                            )
                        }
                    }
                }
                OnboardingStep.PHONE -> {
                    StepHeader("מספר טלפון", "המספר שמחובר לוואטסאפ שלך — תחבר את הוואטסאפ אחרי ההרשמה מתוך האפליקציה")
                    OutlinedTextField(
                        value = phone,
                        onValueChange = viewModel::setPhone,
                        label = { Text("0501234567") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                OnboardingStep.DONE -> {}
            }

            Spacer(Modifier.height(16.dp))
            error?.let {
                Text(it, color = AppRed, fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
            }

        } // end scrollable inner column

        // Action buttons — pinned to the bottom, never scrolled off screen.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (step != OnboardingStep.NAME) {
                OutlinedButton(
                    onClick = viewModel::back,
                    modifier = Modifier.weight(1f),
                    enabled = !isWorking
                ) {
                    Text("חזרה")
                }
            }
            Button(
                onClick = { viewModel.next() },
                modifier = Modifier.weight(2f),
                enabled = !isWorking,
                colors = ButtonDefaults.buttonColors(containerColor = GreenDark)
            ) {
                if (isWorking) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp)
                    )
                } else {
                    Text(
                        when (step) {
                            OnboardingStep.PHONE -> "סיים והיכנס"
                            else -> "המשך"
                        },
                        color = Color.White,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
        } // end outer column
    }
}

@Composable
private fun StepHeader(title: String, subtitle: String) {
    Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = GreenDark)
    Spacer(Modifier.height(4.dp))
    Text(subtitle, fontSize = 13.sp, color = TextSecondary)
    Spacer(Modifier.height(20.dp))
}

@Composable
private fun VehicleChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onClick() },
        color = if (selected) GreenBg else CardBg,
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 1.dp,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (selected) GreenDark else Border
        )
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = selected,
                onClick = onClick,
                colors = RadioButtonDefaults.colors(selectedColor = GreenDark)
            )
            Spacer(Modifier.width(8.dp))
            Text(label, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
    }
}
