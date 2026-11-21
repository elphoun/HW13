#pragma once
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#define INPUT_PULLUP 2
#define OUTPUT 1
#define LOW 0
#define HIGH 1
#define F(x) x
extern uint32_t g_ms; extern int g_pins[32];
inline uint32_t millis(){return g_ms;}
inline void delay(uint32_t d){g_ms+=d;}
inline void pinMode(int,int){}
inline int digitalRead(int p){return g_pins[p];}
inline void tone(int,unsigned,unsigned long=0){}
inline void noTone(int){}
template<class T> T constrain(T x,T a,T b){return x<a?a:(x>b?b:x);}
struct SerialT{ std::string in, out; void begin(long){}
 int available(){return in.size();} int read(){int c=(unsigned char)in[0]; in.erase(0,1); return c;}
 void print(const char*s){out+=s;} void print(char c){out+=c;} void print(int v){out+=std::to_string(v);}
 void println(const char*s){out+=s;out+="\n";} void println(char c){out+=c;out+="\n";} };
extern SerialT Serial;
