/**
 * Waitlist Form Handler
 * Manages form submission and validation
 */

// Load waitlist count on page load
async function loadWaitlistCount() {
    try {
        const response = await fetch('/api/waitlist/count');
        const data = await response.json();
        document.getElementById('total-gladiators').textContent = data.count;
    } catch (error) {
        console.error('Failed to load waitlist count:', error);
    }
}

// Handle form submission
document.getElementById('waitlist-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('.submit-btn');
    const originalText = submitBtn.innerHTML;

    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-text">ENTERING...</span><span class="btn-icon">⏳</span>';

    // Get form data
    const formData = {
        twitterHandle: form.twitterHandle.value.trim(),
        walletAddress: form.walletAddress.value.trim(),
        email: form.email.value.trim() || null,
        userType: form.userType.value
    };

    try {
        const response = await fetch('/api/waitlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.success) {
            // Show success message
            form.style.display = 'none';
            document.getElementById('waitlist-success').style.display = 'block';
            document.getElementById('success-text').textContent = data.message;
            document.getElementById('waitlist-position').textContent = `#${data.position}`;
            document.getElementById('waitlist-total').textContent = data.total;

            // Update total count
            document.getElementById('total-gladiators').textContent = data.total;

            // Trigger celebration animation
            celebrateWaitlistJoin();
        } else {
            // Show error message
            showWaitlistError(data.error);
        }
    } catch (error) {
        showWaitlistError('Network error. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
});

function showWaitlistError(message) {
    document.getElementById('waitlist-form').style.display = 'none';
    document.getElementById('waitlist-error').style.display = 'block';
    document.getElementById('error-text').textContent = message;
}

function resetWaitlistForm() {
    document.getElementById('waitlist-form').style.display = 'block';
    document.getElementById('waitlist-success').style.display = 'none';
    document.getElementById('waitlist-error').style.display = 'none';
    document.getElementById('waitlist-form').reset();
}

function celebrateWaitlistJoin() {
    // Create particle burst animation
    if (window.battleEffects) {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // Victory burst
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                window.battleEffects.createEnergyBeam(
                    centerX + (Math.random() - 0.5) * 200,
                    centerY + (Math.random() - 0.5) * 200,
                    centerX + (Math.random() - 0.5) * 400,
                    centerY + (Math.random() - 0.5) * 400
                );
            }, i * 50);
        }
    }

    // Animate success message
    const successMsg = document.getElementById('waitlist-success');
    gsap.from(successMsg, {
        scale: 0.8,
        opacity: 0,
        duration: 0.6,
        ease: 'back.out(1.7)'
    });

    gsap.from('#waitlist-position', {
        scale: 0,
        rotation: 360,
        duration: 1,
        delay: 0.3,
        ease: 'elastic.out(1, 0.5)'
    });
}

// Auto-fill wallet if connected
async function checkWalletConnection() {
    if (window.solana && window.solana.isPhantom) {
        try {
            const resp = await window.solana.connect({ onlyIfTrusted: true });
            const walletInput = document.getElementById('wallet-address');
            if (walletInput && !walletInput.value) {
                walletInput.value = resp.publicKey.toString();
            }
        } catch (err) {
            // User not connected, that's fine
        }
    }
}

// Initialize
window.addEventListener('load', () => {
    loadWaitlistCount();
    checkWalletConnection();

    // Refresh count every 30 seconds
    setInterval(loadWaitlistCount, 30000);
});
