import 'package:flutter/material.dart';

/// CineBook dark "cinema" theme.
final cineTheme = ThemeData(
  useMaterial3: true,
  brightness: Brightness.dark,
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFFE50914), // cinema red
    brightness: Brightness.dark,
  ),
  scaffoldBackgroundColor: const Color(0xFF0E0E12),
  cardTheme: const CardThemeData(
    color: Color(0xFF1A1A22),
    elevation: 0,
    margin: EdgeInsets.zero,
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true,
    fillColor: Color(0xFF1A1A22),
    border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size.fromHeight(50),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  ),
);
