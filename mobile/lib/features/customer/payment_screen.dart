import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import 'catalog_repository.dart';

const _testCards = [
  ('4111111111111111', 'Always succeeds'),
  ('4000000000000002', 'Always fails'),
  ('4000000000009995', 'Randomly fails'),
];

class PaymentScreen extends ConsumerStatefulWidget {
  final String bookingId;
  final int amount;
  const PaymentScreen({super.key, required this.bookingId, required this.amount});
  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  String _card = _testCards.first.$1;
  bool _busy = false;
  String? _error;
  late int _amount = widget.amount;
  final _promoCtrl = TextEditingController();
  String? _promoMsg;
  bool _promoOk = false;

  @override
  void dispose() {
    _promoCtrl.dispose();
    super.dispose();
  }

  Future<void> _applyPromo() async {
    final code = _promoCtrl.text.trim();
    if (code.isEmpty) return;
    setState(() => _promoMsg = null);
    try {
      final res = await ref.read(catalogRepoProvider).applyPromo(widget.bookingId, code);
      setState(() {
        _amount = res['totalCost'] as int;
        _promoMsg = res['message'] as String?;
        _promoOk = true;
      });
    } catch (e) {
      setState(() {
        _promoMsg = apiErrorMessage(e);
        _promoOk = false;
      });
    }
  }

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(catalogRepoProvider);
      await repo.startPayment(widget.bookingId);
      final res = await repo.confirmPayment(widget.bookingId, _card);
      ref.invalidate(myBookingsProvider);
      if (mounted && res['status'] == 'success') {
        context.go('/confirmed', extra: {'txn': res['transactionId'], 'amount': res['amount']});
      } else {
        setState(() => _error = 'Payment did not succeed');
      }
    } catch (e) {
      setState(() => _error = apiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Amount due'),
                    Text('₹$_amount', style: Theme.of(context).textTheme.headlineSmall),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text('Promo code', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _promoCtrl,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      hintText: 'e.g. WELCOME10, FLAT50, CINE20',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(onPressed: _busy ? null : _applyPromo, child: const Text('Apply')),
              ],
            ),
            if (_promoMsg != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_promoMsg!, style: TextStyle(color: _promoOk ? Colors.greenAccent : Colors.redAccent, fontSize: 12)),
              ),
            const SizedBox(height: 20),
            Text('Test card', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ..._testCards.map((c) => RadioListTile<String>(
                  value: c.$1,
                  groupValue: _card,
                  onChanged: (v) => setState(() => _card = v!),
                  title: Text(c.$1),
                  subtitle: Text(c.$2),
                )),
            const Spacer(),
            if (_error != null) ...[
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              const SizedBox(height: 12),
            ],
            FilledButton(
              onPressed: _busy ? null : _pay,
              child: _busy
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text('Pay ₹$_amount'),
            ),
          ],
        ),
      ),
    );
  }
}

class ConfirmedScreen extends StatelessWidget {
  final String? txn;
  final int? amount;
  const ConfirmedScreen({super.key, this.txn, this.amount});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 96),
              const SizedBox(height: 16),
              Text('Booking confirmed!', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 8),
              if (amount != null) Text('Paid ₹$amount'),
              const SizedBox(height: 24),
              FilledButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
            ],
          ),
        ),
      ),
    );
  }
}
