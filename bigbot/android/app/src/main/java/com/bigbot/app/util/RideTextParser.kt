package com.bigbot.app.util

data class ParsedRideInfo(
    val price: String = "",
    val street: String = "",
    val streetNumber: String = "",
    val specialTags: List<String> = emptyList(),
    /** Detected vehicle type label (e.g. "מיניק", "מיניבוס", "ויטו"). Empty if none. */
    val vehicleType: String = "",
    /** Number of seats inferred from the vehicle type or text. Empty = use default 4. */
    val vehicleSeats: String = ""
)

object RideTextParser {

    // מילים שמייצגות רעש — אם השורה מכילה אחת מהן, מתעלמים ממנה לגמרי
    private val noiseKeywords = listOf(
        "רייד", "הפצה", "בקבוצות", "בקבוצה", "בקישור", "wa.me", "http", "https",
        "ללא פון", "סדרן", "לשאלות", "זמן", "זמנים", "תפוצה", "מנוי",
        "פרו דיגיטל", "דיגיטל", "vip", "VIP", "צור קשר", "להזמנות",
        "צאט", "צ'אט", "ערוץ", "טלגרם", "טלפון", "קישור", "וואצאפ", "ווצאפ"
    )

    // Decorative emojis used in dispatcher branding ("🏆 ♦️ דרכי נועם ♦️🏆").
    // Lines containing any of these are NEVER street names.
    private val decorativeEmojis = listOf(
        "🏆", "♦️", "♦", "💎", "💰", "🔥", "⭐", "★", "☆", "💯", "✨",
        "🥇", "🥈", "🥉", "🎯", "🎖️", "🏅", "👑", "💪", "💵", "💸"
    )

    // ביטויים מיוחדים שכן צריך להציג כתגית
    private val specialKeywords = listOf(
        "אנשים", "נוסעים", "פלוס", "סלקל", "ילד", "ילדים", "כיסא תינוק",
        "כיסא בטיחות", "מזוודה", "מזוודות", "חיה", "כלב", "חתול",
        "דחוף", "מיידי", "מהיר", "אקספרס", "ספסל",
        "ון", "טנדר", "מונית גדולה", "VAN"
    )

    // Vehicle keywords — these are NEVER street names. When detected, the
    // matching label is shown next to the seats line and the parser skips the
    // line containing them so it never becomes "street". The Int is the seat
    // count to display (0 = unknown, fall back to whatever was already shown).
    private val vehicleKeywords: List<Pair<String, Int>> = listOf(
        "מיניק"     to 6,
        "מיניבוס"   to 8,
        "סיינה"     to 7,
        "סייאנה"    to 7,
        "ויטו"      to 8,
        "מרווח"     to 6,
        "ספיישל"    to 0,
        "ספישל"     to 0,
        "רכב גדול"  to 0,
        "8 מקומות"  to 8,
        "שמונה מקומות" to 8,
        "7 מקומות"  to 7,
        "שבע מקומות"   to 7,
        "6 מקומות"  to 6,
        "שש מקומות"    to 6,
    )

    // קיצורי אזורים ידועים — לא ייחשבו כשמות רחובות
    private val knownAreas = setOf(
        "בב", "תא", "ים", "פת", "שמש", "ספר", "נת", "ראשלצ", "חיפה", "אשדוד",
        "אשקלון", "באר שבע", "באר", "שבע", "בני ברק", "תל אביב", "ירושלים",
        "פתח תקווה", "בית שמש", "מודיעין", "נתניה", "ראשון לציון", "רחובות",
        "חולון", "בת ים", "רמת גן", "גבעתיים", "הרצליה", "כפר סבא", "רעננה"
    )

    /** Returns the first vehicle keyword found in the text (case-insensitive),
     * along with its associated seat count. */
    private fun detectVehicleKeyword(text: String): Pair<String, Int>? {
        val lower = text.lowercase()
        for ((kw, seats) in vehicleKeywords) {
            if (lower.contains(kw.lowercase())) return kw to seats
        }
        return null
    }

    fun parse(rawText: String, origin: String, destination: String): ParsedRideInfo {
        if (rawText.isBlank()) return ParsedRideInfo()

        // Detect vehicle keyword from the entire raw message — used to populate
        // vehicleType / vehicleSeats and to skip lines that would otherwise be
        // misparsed as a street name (e.g. "מיניק 300").
        val vehicleHit = detectVehicleKeyword(rawText)

        val rawLines = rawText.split("\n", "\r")
            .map { it.trim() }
            .filter { it.isNotBlank() }

        // פילטור שורות רעש
        val cleanLines = rawLines.filter { line ->
            // לא שורת מפרידים
            if (line.all { it == '-' || it == '_' || it == '=' || it == '*' || it.isWhitespace() }) return@filter false
            // לא רק זמן (12:34)
            if (line.matches(Regex("^\\d{1,2}[:.]\\d{2}$"))) return@filter false
            // לא מכיל מילות רעש
            val lowerLine = line.lowercase()
            if (noiseKeywords.any { lowerLine.contains(it.lowercase()) }) return@filter false
            // לא רק שם באנגלית (כמו "Y. A" או "John Doe") — שורה ללא תווים עבריים שמכילה רק אותיות
            val hasHebrew = line.any { it in '\u0590'..'\u05FF' }
            val hasDigit = line.any { it.isDigit() }
            if (!hasHebrew && !hasDigit) return@filter false
            true
        }

        // Lines that mention a vehicle keyword are vehicle-type info, NOT
        // street info — strip them so the street parser ignores them.
        val streetCandidateLines = cleanLines.filter { line ->
            val lower = line.lowercase()
            vehicleKeywords.none { (kw, _) -> lower.contains(kw.lowercase()) }
        }

        // חילוץ מחיר — מספר 20-9999 בשורה הראשונה שמכילה origin/destination, או הראשון שנמצא
        var price = ""
        for (line in cleanLines) {
            val matches = Regex("\\b(\\d{2,4})\\b").findAll(line).toList()
            for (m in matches) {
                val n = m.value.toIntOrNull() ?: continue
                if (n in 20..9999) {
                    price = m.value
                    break
                }
            }
            if (price.isNotEmpty()) break
        }

        // חילוץ רחוב + מספר — שורה אחרי שורת המסלול שהיא בעיקר עברית, קצרה, ללא מספרים גדולים
        var street = ""
        var streetNumber = ""

        // איתור שורת המסלול (שמכילה origin או destination)
        val routeIdx = streetCandidateLines.indexOfFirst { line ->
            (origin.isNotEmpty() && line.contains(origin)) ||
            (destination.isNotEmpty() && line.contains(destination))
        }

        if (routeIdx >= 0) {
            // חיפוש רחוב בשורה הבאה (או באותה שורה אחרי המחיר)
            for (i in (routeIdx + 1)..streetCandidateLines.size.coerceAtMost(routeIdx + 3)) {
                if (i >= streetCandidateLines.size) break
                val line = streetCandidateLines[i]
                // לדלג על שורות עם אמוג'י קישוט של תחנה / מותג סדרן
                if (decorativeEmojis.any { line.contains(it) }) continue
                // השורה צריכה להיות עברית בעיקר, לא כוללת אזור ידוע
                val words = line.split(Regex("\\s+")).filter { it.isNotBlank() }
                if (words.isEmpty() || words.size > 4) continue
                // לא להיכנס אם זה רק שם פרטי קצר (אות אחת + נקודה)
                if (line.matches(Regex(".*[A-Za-z]\\..*"))) continue
                // לא לקחת אם השורה מכילה אזור ידוע
                if (knownAreas.any { area -> words.any { it == area } }) continue
                // הסרת מספר מהשורה כדי לקבל את שם הרחוב
                val streetName = line.replace(Regex("\\b\\d+\\b"), "").trim()
                if (streetName.isBlank() || streetName.length !in 2..30) continue
                // צריך לפחות אות עברית או אנגלית — לא רק סימני פיסוק
                if (!streetName.any { it.isLetter() }) continue
                // רק עכשיו — מאשרים את הרחוב וקובעים גם מספר רחוב (אם יש)
                street = streetName
                val numMatch = Regex("\\b(\\d{1,4})\\b").find(line)
                if (numMatch != null) {
                    val n = numMatch.value.toIntOrNull() ?: 0
                    if (n in 1..9999) streetNumber = numMatch.value
                }
                break
            }
        }

        // חילוץ תגיות מיוחדות
        val specialTags = mutableListOf<String>()
        for (line in cleanLines) {
            val lowerLine = line.lowercase()
            for (kw in specialKeywords) {
                if (lowerLine.contains(kw.lowercase())) {
                    // הוסף את השורה (קצרה) כתגית, אם עוד לא נוספה
                    val tag = line.take(40)
                    if (specialTags.none { it == tag } && tag.length in 2..40) {
                        specialTags.add(tag)
                    }
                    break
                }
            }
        }

        return ParsedRideInfo(
            price = price,
            street = street,
            streetNumber = streetNumber,
            specialTags = specialTags,
            vehicleType = vehicleHit?.first.orEmpty(),
            vehicleSeats = vehicleHit?.second?.takeIf { it > 0 }?.toString().orEmpty()
        )
    }
}
