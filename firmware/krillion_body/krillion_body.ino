/*
 * KRILLION — Arduino "body" firmware
 *
 * The laptop runs the game (prompts, speech recognition, scoring). This sketch
 * just drives the hardware and reports button presses over USB serial, so no
 * game content lives here.
 *
 * Wiring (matches Lily's breadboard diagram)
 *   LCD1602 (parallel)  RS=8  E=7  D4=3  D5=4  D6=5  D7=6
 *                       VSS=GND VDD=5V  V0=10k pot wiper  RW=GND
 *                       A(15)=5V via resistor  K(16)=GND
 *   Servo SG90          signal=11 (orange), red=5V, brown=GND
 *   Buzzer              driven by BC337 NPN, base via resistor from pin 2
 *   Talk button         9  (5V on one side, 10k pull-down to GND)
 *   Start button        10 (5V on one side, 10k pull-down to GND)
 *
 * Serial protocol: 115200 baud, one command per line, laptop -> Arduino.
 * Every command is answered with "OK" once it has finished, so the laptop
 * never overflows the 64-byte serial buffer during a slow servo sweep.
 *
 *   C            clear the LCD
 *   0<text>      write row 0 (stops any marquee)
 *   1<text>      write row 1
 *   M<text>      scroll <text> across row 0 (marquee)
 *   A<deg>       sweep servo to <deg> (0..180)
 *   W            wiggle the servo (someone is out)
 *   S<name>      sound: turn ok good great krill bad out win tick
 *   ?            ping, answers "READY"
 *
 * In LCD text, byte 0x01 draws a full heart and 0x02 an empty heart.
 *
 * Events, Arduino -> laptop:
 *   READY        on boot
 *   B<n>D / B<n>U   button n pressed / released (0 = talk, 1 = start)
 */

#include <LiquidCrystal.h>
#include <Servo.h>

LiquidCrystal lcd(8, 7, 3, 4, 5, 6);   // RS, E, D4, D5, D6, D7
Servo pointer;

const uint8_t PIN_SERVO  = 11;
const uint8_t PIN_BUZZER = 2;          // through the BC337 transistor
const uint8_t PIN_BTN[]  = {9, 10};    // talk, start

// Buttons wired to 5V with external pull-down resistors read HIGH when pressed.
// If you rewire them to GND with no resistors instead, set this to 0.
#define BUTTONS_ACTIVE_HIGH 1
const uint8_t NUM_BTN    = sizeof(PIN_BTN);

uint8_t servoAngle = 90;

// --- glyphs -----------------------------------------------------------------
uint8_t heartFull[8]  = {0b00000, 0b01010, 0b11111, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000};
uint8_t heartEmpty[8] = {0b00000, 0b01010, 0b10101, 0b10001, 0b10001, 0b01010, 0b00100, 0b00000};

// --- marquee ----------------------------------------------------------------
char     marquee[97];
uint8_t  marqueeLen = 0, marqueePos = 0;
uint32_t marqueeAt = 0;
const uint16_t MARQUEE_MS = 280;

void writeRow(uint8_t row, const char* t) {
  lcd.setCursor(0, row);
  uint8_t n = 0;
  while (t[n] && n < 16) { lcd.write((uint8_t)t[n]); n++; }
  while (n++ < 16) lcd.write(' ');
}

void drawMarquee() {
  lcd.setCursor(0, 0);
  uint8_t total = marqueeLen + 4;
  for (uint8_t k = 0; k < 16; k++) {
    uint8_t i = (marqueePos + k) % total;
    lcd.write(i < marqueeLen ? (uint8_t)marquee[i] : ' ');
  }
}

void startMarquee(const char* t) {
  strncpy(marquee, t, sizeof(marquee) - 1);
  marquee[sizeof(marquee) - 1] = '\0';
  marqueeLen = strlen(marquee);
  marqueePos = 0;
  marqueeAt = millis();
  if (marqueeLen <= 16) { writeRow(0, marquee); marqueeLen = 0; }  // fits: static
  else drawMarquee();
}

void tickMarquee() {
  if (marqueeLen == 0 || millis() - marqueeAt < MARQUEE_MS) return;
  marqueeAt = millis();
  marqueePos = (marqueePos + 1) % (marqueeLen + 4);
  drawMarquee();
}

// --- servo ------------------------------------------------------------------
void sweepTo(int target) {
  target = constrain(target, 0, 180);
  while (servoAngle != target) {
    servoAngle += (target > servoAngle) ? 1 : -1;
    pointer.write(servoAngle);
    delay(6);
  }
}

void wiggle() {
  int base = servoAngle;
  for (uint8_t i = 0; i < 4; i++) {
    pointer.write(constrain(base - 12, 0, 180)); delay(90);
    pointer.write(constrain(base + 12, 0, 180)); delay(90);
  }
  pointer.write(base);
}

// --- sound ------------------------------------------------------------------
void beep(uint16_t f, uint16_t ms) { tone(PIN_BUZZER, f, ms); delay(ms + 20); }

void playSound(const char* name) {
  if      (!strcmp(name, "turn"))  { beep(988, 60); beep(1319, 90); }
  else if (!strcmp(name, "ok"))    { beep(880, 120); }                                   // common answer
  else if (!strcmp(name, "good"))  { beep(1047, 80); beep(1319, 120); }
  else if (!strcmp(name, "great")) { beep(1047, 70); beep(1319, 70); beep(1568, 140); }
  else if (!strcmp(name, "krill")) {                                                     // one in a krillion
    for (uint8_t r = 0; r < 2; r++) { beep(1568, 70); beep(2093, 70); beep(2637, 70); }
    beep(3136, 300);
  }
  else if (!strcmp(name, "bad"))   { beep(220, 350); }
  else if (!strcmp(name, "tick"))  { tone(PIN_BUZZER, 1800, 25); }                        // non-blocking
  else if (!strcmp(name, "out")) {
    for (uint16_t f = 900; f > 120; f -= 15) { tone(PIN_BUZZER, f); delay(12); }
    noTone(PIN_BUZZER); delay(80); beep(110, 600);
  }
  else if (!strcmp(name, "win")) {
    const uint16_t n[] = {523, 659, 784, 1047, 784, 1047};
    const uint16_t d[] = {120, 120, 120, 250, 120, 400};
    for (uint8_t i = 0; i < 6; i++) beep(n[i], d[i]);
  }
}

// --- buttons ----------------------------------------------------------------
bool     btnDown[NUM_BTN];
uint32_t btnEdgeAt[NUM_BTN];

void pollButtons() {
  uint32_t now = millis();
  for (uint8_t i = 0; i < NUM_BTN; i++) {
    bool down = digitalRead(PIN_BTN[i]) == (BUTTONS_ACTIVE_HIGH ? HIGH : LOW);
    if (down != btnDown[i] && now - btnEdgeAt[i] > 25) {
      btnDown[i] = down;
      btnEdgeAt[i] = now;
      Serial.print('B'); Serial.print(i); Serial.println(down ? 'D' : 'U');
    }
  }
}

// --- commands ---------------------------------------------------------------
char    line[100];
uint8_t lineLen = 0;

void runCommand(char* cmd) {
  char op = cmd[0];
  char* arg = cmd + 1;
  switch (op) {
    case 'C': marqueeLen = 0; lcd.clear(); break;
    case '0': marqueeLen = 0; writeRow(0, arg); break;
    case '1': writeRow(1, arg); break;
    case 'M': startMarquee(arg); break;
    case 'A': sweepTo(atoi(arg)); break;
    case 'W': wiggle(); break;
    case 'S': playSound(arg); break;
    case '?': Serial.println(F("READY")); return;
    default:  Serial.print(F("ERR ")); Serial.println(cmd); return;
  }
  Serial.println(F("OK"));
}

void pollSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[lineLen] = '\0';
      if (lineLen > 0) runCommand(line);
      lineLen = 0;
    } else if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    }
  }
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < NUM_BTN; i++)
    pinMode(PIN_BTN[i], BUTTONS_ACTIVE_HIGH ? INPUT : INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pointer.attach(PIN_SERVO);
  pointer.write(servoAngle);

  lcd.begin(16, 2);
  lcd.createChar(1, heartFull);
  lcd.createChar(2, heartEmpty);
  writeRow(0, "  ~ KRILLION ~");
  writeRow(1, "waiting for host");

  Serial.println(F("READY"));
}

void loop() {
  pollSerial();
  pollButtons();
  tickMarquee();
}
