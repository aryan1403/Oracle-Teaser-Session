// Form Logic
function calculateLoan() {
    const amount = parseFloat(document.querySelector('[aria-label="Requested Loan Amount"]').value);
    const tenure = parseFloat(document.querySelector('[aria-label="Tenure in Years"]').value);
    const income = parseFloat(document.querySelector('[aria-label="Monthly Income"]').value);

    // Simple mock logic
    const maxAmount = income * 60; // Max loan is 60 times monthly income
    const isApproved = amount <= maxAmount;

    const resultDiv = document.getElementById('eligibility-result') || document.querySelector('.result-value');
    const maxAmountEl = document.getElementById('max-amount') || document.querySelector('strong:nth-of-type(1)');
    const estEmiEl = document.getElementById('est-emi') || document.querySelectorAll('strong')[1];

    if(resultDiv) {
        resultDiv.textContent = isApproved ? "Pre-Approved" : "Requires Manual Review";
        resultDiv.className = `result-value ${isApproved ? 'status-approved' : 'status-rejected'}`;
    }
    
    if(maxAmountEl) maxAmountEl.textContent = `$${maxAmount.toLocaleString()}`;
    
    // Simple EMI calc (P*R*(1+R)^N)/((1+R)^N - 1), mock rate 8%
    const r = 0.08 / 12;
    const n = tenure * 12;
    const emi = (amount * r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
    
    if(estEmiEl) estEmiEl.textContent = `$${Math.round(emi).toLocaleString()}`;

    const formSection = document.getElementById('form-section') || document.querySelector('section:first-of-type');
    const resultSection = document.getElementById('result-section') || document.querySelector('.result-card').parentElement;

    if(formSection) formSection.classList.add('hidden');
    if(resultSection) resultSection.classList.remove('hidden');
}

function resetForm() {
    const form = document.getElementById('loan-form') || document.querySelector('form');
    if(form) form.reset();
    
    const formSection = document.getElementById('form-section') || document.querySelector('section:first-of-type');
    const resultSection = document.getElementById('result-section') || document.querySelector('.result-card').parentElement;

    if(formSection) formSection.classList.remove('hidden');
    if(resultSection) resultSection.classList.add('hidden');
}


// --- THE CHAOS MODE (DOM SCRAMBLER) ---
// This simulates a chaotic frontend deployment where IDs, Classes, and layout structure change,
// breaking traditional automation but maintaining the Accessibility Tree.

let isChaosActive = false;

document.getElementById('chaos-btn').addEventListener('click', () => {
    isChaosActive = !isChaosActive;
    const status = document.getElementById('chaos-status');
    
    if(isChaosActive) {
        status.textContent = "ATTENTION: Structural DOM Mutation Active (IDs/Classes Scrambled)";
        status.className = "status-on";
        scrambleDOM();
    } else {
        // Reload page to reset
        window.location.reload();
    }
});

function generateHash() {
    return 'dynamic_' + Math.random().toString(36).substring(2, 10);
}

function scrambleDOM() {
    const idsToScramble = [
        'form-section', 'loan-form', 'group-amount', 'loan-amount', 
        'group-tenure', 'loan-tenure', 'group-income', 'monthly-income',
        'group-action', 'calculate-btn'
    ];

    idsToScramble.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // 1. Scramble ID
            el.id = generateHash();
            
            // 2. Scramble Classes (remove existing structural ones, add junk ones)
            if (el.classList.contains('input-group')) {
                el.classList.remove('input-group');
                el.classList.add('div-container-v2', generateHash());
            }
            if (el.classList.contains('primary-btn')) {
                el.classList.remove('primary-btn');
                el.classList.add('btn-submit-new', 'style-chaos', generateHash());
            }

            // 3. Wrap in random divs to break XPath structure
            if (el.tagName === 'INPUT') {
                const wrapper = document.createElement('div');
                wrapper.className = `wrapper-chaos ${generateHash()}`;
                el.parentNode.insertBefore(wrapper, el);
                wrapper.appendChild(el);
            }
        }
    });

    // Scramble labels `for` attribute to match new IDs, or simply leave them wrapping.
    // Playwright uses `aria-label` mainly if `for` breaks, but we will leave aria-label intact 
    // to demonstrate accessibility robustness.

    console.log("DOM Scrambled! Traditional selectors will now fail.");
}
