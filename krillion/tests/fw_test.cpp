#include "../firmware/krillion_body/krillion_body.ino"
#include <cassert>
uint32_t g_ms=0; int g_pins[32]; int g_servo=90; SerialT Serial;
void run(int n=20){ for(int i=0;i<n;i++){ loop(); g_ms+=10; } }
std::string take(){ std::string s=Serial.out; Serial.out.clear(); return s; }
int main(){
  for(int i=0;i<32;i++) g_pins[i]=HIGH;
  setup(); assert(take()=="READY\n");
  Serial.in = "C\n0Hello\n1P1 \x01\x01\x02  Sc0    9\nA165\nSkrill\nW\n?\nXbad\n"; run();
  std::string o = take(); printf("%s", o.c_str());
  assert(o=="OK\nOK\nOK\nOK\nOK\nOK\nREADY\nERR Xbad\n");
  printf("[%s]\n[%s] servo=%d\n", lcd.b[0], lcd.b[1], g_servo);
  assert(g_servo==165 && !strncmp(lcd.b[1],"P1 ##o",6));
  Serial.in = "MName a Greek god or goddess please\n"; run(1); take();
  std::string first = lcd.b[0]; run(40); assert(first != lcd.b[0]);   // marquee moves
  printf("marquee: [%s] -> [%s]\n", first.c_str(), lcd.b[0]);
  Serial.in = "0static\n"; run(1); take(); std::string st=lcd.b[0]; run(40); assert(st==lcd.b[0]); // marquee stopped
  Serial.in = "1" + std::string(150,'x') + "\n"; run(); assert(take()=="OK\n");             // long line safe
  g_pins[7]=LOW; run(5); g_pins[7]=HIGH; run(5); g_pins[6]=LOW; run(5);
  o=take(); printf("%s", o.c_str()); assert(o=="B0D\nB0U\nB1D\n");
  puts("firmware OK");
}
