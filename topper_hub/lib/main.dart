import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'firebase_options.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Offline-first: unlimited cache
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: true,
    cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
  );

  runApp(const DemoApp());
}

class DemoApp extends StatelessWidget {
  const DemoApp({super.key});
  @override
  Widget build(BuildContext context) =>
      const MaterialApp(home: DemoHome(), debugShowCheckedModeBanner: false);
}

class DemoHome extends StatefulWidget {
  const DemoHome({super.key});
  @override
  State<DemoHome> createState() => _DemoHomeState();
}

class _DemoHomeState extends State<DemoHome> {
  String _status = 'Idle';
  User? _user;
  List<Map<String, dynamic>> _settingsDocs = [];

  @override
  void initState() {
    super.initState();
    FirebaseAuth.instance.authStateChanges().listen((u) {
      setState(() => _user = u);
      if (u != null) _loadSettings();
    });
    if (FirebaseAuth.instance.currentUser != null) _loadSettings();
  }

  Future<void> _signInAnon() async {
    setState(() => _status = 'Signing in…');
    try {
      await FirebaseAuth.instance.signInAnonymously();
      setState(() => _status = 'Signed in anonymously');
    } catch (e) {
      setState(() => _status = 'Auth error: $e');
    }
  }

  Future<void> _loadSettings() async {
    try {
      // Listen (not get) so offline cache + live updates both drive UI
      FirebaseFirestore.instance
          .collection('settings')
          .snapshots()
          .listen((snap) {
        if (!mounted) return;
        setState(() {
          _settingsDocs =
              snap.docs.map((d) => {'id': d.id, ...d.data()}).toList();
          _status = 'Loaded ${_settingsDocs.length} settings doc(s)';
        });
      });
    } catch (e) {
      setState(() => _status = 'Firestore error: $e');
    }
  }

  Future<void> _testWrite() async {
    setState(() => _status = 'Writing test doc…');
    try {
      await FirebaseFirestore.instance
          .collection('demo')
          .doc('ping')
          .set({
        'at': DateTime.now().millisecondsSinceEpoch,
        'from': 'flutter-demo',
      });
      setState(() => _status = 'Write queued/sent ✓ (check offline!)');
    } catch (e) {
      setState(() => _status = 'Write error: $e');
    }
  }

  Future<void> _signOut() async {
    await FirebaseAuth.instance.signOut();
    setState(() {
      _user = null;
      _settingsDocs = [];
      _status = 'Signed out';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Topper Hub — Demo')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Status: $_status', style: const TextStyle(fontSize: 16)),
            const SizedBox(height: 8),
            Text('User: ${_user?.uid ?? "not signed in"}'),
            const SizedBox(height: 16),
            if (_user == null)
              ElevatedButton(
                onPressed: _signInAnon,
                child: const Text('Sign in anonymously'),
              )
            else ...[
              ElevatedButton(
                onPressed: _testWrite,
                child: const Text('Write test doc to /demo/ping'),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _signOut,
                child: const Text('Sign out'),
              ),
            ],
            const Divider(height: 32),
            const Text('Firestore /settings:',
                style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Expanded(
              child: _settingsDocs.isEmpty
                  ? const Text('(empty or not loaded)')
                  : ListView(
                children: _settingsDocs
                    .map((d) => Card(
                  child: ListTile(
                    title: Text(d['id'].toString()),
                    subtitle: Text(d.toString()),
                  ),
                ))
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}