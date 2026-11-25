import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:topper_hub/main.dart';

void main() {
  testWidgets('Demo app boots to the status screen', (tester) async {
    await tester.pumpWidget(const DemoApp());
    await tester.pump();

    // AppBar title is present
    expect(find.text('Topper Hub — Demo'), findsOneWidget);

    // Initial status line is visible
    expect(find.textContaining('Status:'), findsOneWidget);
  });
}