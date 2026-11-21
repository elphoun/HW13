#pragma once
#include <Arduino.h>
struct LiquidCrystal{ char b[2][17]; int c=0,r=0;
 LiquidCrystal(int,int,int,int,int,int){clear();}
 void begin(int,int){} void clear(){memset(b,' ',sizeof b);b[0][16]=b[1][16]=0;c=r=0;}
 void setCursor(int cc,int rr){c=cc;r=rr;}
 void write(uint8_t ch){ if(c>=16){printf("LCD OVERFLOW\n");exit(1);} b[r][c++]= ch==1?'#':ch==2?'o':ch; }
 void createChar(int,uint8_t*){} };
