#pragma once
extern int g_servo;
struct Servo{ void attach(int){} void write(int a){ if(a<0||a>180){printf("BAD ANGLE\n");exit(1);} g_servo=a;} };
