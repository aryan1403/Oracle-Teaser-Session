// Initial Ledger Balance State
let senderBalance = 1000.00;
let recipientBalance = 500.00;

const senderBalanceEl = document.getElementById('sender-balance');
const recipientBalanceEl = document.getElementById('recipient-balance');
const transactionStateEl = document.getElementById('transaction-state');
const ledgerLockEl = document.getElementById('ledger-lock-status');
const errorAlertEl = document.getElementById('error-alert');
const errorMessageEl = document.getElementById('error-message');

function updateBalancesUI() {
    senderBalanceEl.textContent = `$${senderBalance.toFixed(2)}`;
    recipientBalanceEl.textContent = `$${recipientBalance.toFixed(2)}`;
}

async function initiateTransfer() {
    const amountInput = document.getElementById('transfer-amount');
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        showError("Invalid transfer amount.");
        return;
    }

    if (amount > senderBalance) {
        showError("Insufficient balance in source account.");
        return;
    }

    // Reset alert
    errorAlertEl.classList.add('hidden');

    // 1. Lock ledger state and deduct optimistic balance (funds held in transit)
    ledgerLockEl.textContent = "Locked (Transaction in Transit)";
    ledgerLockEl.style.color = "var(--warning-color)";
    transactionStateEl.textContent = "Processing Clearing...";
    transactionStateEl.className = "state-processing";

    const originalSenderBalance = senderBalance;
    senderBalance -= amount;
    senderBalanceEl.textContent = `$${senderBalance.toFixed(2)}`;

    // 2. Dispatch payload to Clearing House API
    try {
        const response = await fetch('/api/clear-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                senderAccount: '9821',
                recipientAccount: '4302',
                amount: amount
            })
        });

        if (!response.ok) {
            throw new Error(`Clearing House Rejected Transaction: Status ${response.status}`);
        }

        // Success: Commit the ledger updates
        recipientBalance += amount;
        updateBalancesUI();
        
        transactionStateEl.textContent = "Cleared & Settled";
        transactionStateEl.className = "state-cleared";
        
        ledgerLockEl.textContent = "Unlocked";
        ledgerLockEl.style.color = "var(--success-color)";
        amountInput.value = '';

    } catch (error) {
        // Rollback: Restore ledger balance state to original values
        senderBalance = originalSenderBalance;
        updateBalancesUI();

        transactionStateEl.textContent = "Transaction Rolled Back";
        transactionStateEl.className = "state-rolledback";
        
        ledgerLockEl.textContent = "Unlocked (Reconciled)";
        ledgerLockEl.style.color = "var(--danger-color)";
        
        showError(`Rollback Triggered. Ledger restored to $${senderBalance.toFixed(2)}. Details: ${error.message}`);
    }
}

function showError(msg) {
    errorMessageEl.textContent = msg;
    errorAlertEl.classList.remove('hidden');
}
