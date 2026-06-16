import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth.dart';
import '../admin/admin_screen.dart';
import '../customer/bookings_screen.dart';
import '../customer/browse_screen.dart';
import '../customer/chat_screen.dart';
import '../manager/manager_screen.dart';

class _Tab {
  final String label;
  final IconData icon;
  final Widget screen;
  const _Tab(this.label, this.icon, this.screen);
}

/// Role-gated navigation: the same binary shows different tabs per role,
/// decoded from the JWT. (RBAC is also enforced server-side.)
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});
  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  List<_Tab> _tabsFor(String? role) {
    switch (role) {
      case 'hall_manager':
        return const [
          _Tab('Schedule', Icons.event_note, ManagerScreen()),
          _Tab('Chat', Icons.smart_toy_outlined, ChatScreen()),
        ];
      case 'admin':
        return const [
          _Tab('Admin', Icons.admin_panel_settings, AdminScreen()),
          _Tab('Browse', Icons.movie, BrowseScreen()),
          _Tab('Chat', Icons.smart_toy_outlined, ChatScreen()),
        ];
      default: // customer
        return const [
          _Tab('Browse', Icons.movie, BrowseScreen()),
          _Tab('Bookings', Icons.confirmation_num, BookingsScreen()),
          _Tab('Chat', Icons.smart_toy_outlined, ChatScreen()),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final tabs = _tabsFor(auth.role);
    if (_index >= tabs.length) _index = 0;

    return Scaffold(
      appBar: AppBar(
        title: Text('CineBook · ${auth.name ?? 'Guest'}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authProvider.notifier).logout(),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: tabs.map((t) => t.screen).toList()),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: tabs.map((t) => NavigationDestination(icon: Icon(t.icon), label: t.label)).toList(),
      ),
    );
  }
}
