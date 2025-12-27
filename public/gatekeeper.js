document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('gatekeeper-overlay');
    const input = document.getElementById('access-code');
    const btnEnter = document.getElementById('btn-access');
    const errorMsg = document.getElementById('gate-error');
    const waitlistTrigger = document.getElementById('trigger-waitlist');
    const waitlistContainer = document.getElementById('gate-waitlist-container');
    const mainContent = document.querySelector('main') || document.body;

    // 1. Check for existing access
    const storedToken = localStorage.getItem('arena_access_token');

    // NOTE: For debugging/development, you might want to uncomment this to clear token
    // localStorage.removeItem('arena_access_token');

    if (storedToken) {
        // Already authorized
        unlockGate(false);
    } else {
        // Locked
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }

    // 2. Unlock Function
    function unlockGate(animate = true) {
        document.body.style.overflow = ''; // Restore scrolling

        if (animate) {
            // Play unlock animation
            overlay.classList.add('gate-open');

            // Wait for gate animation then fade out
            setTimeout(() => {
                overlay.classList.add('hidden');
                // Remove from DOM after transition to save resources
                setTimeout(() => {
                    overlay.style.display = 'none';
                    // Trigger "Welcome" animations in the main app if needed
                    if (window.arenaAnimations && window.arenaAnimations.refreshScrollTriggers) {
                        window.arenaAnimations.refreshScrollTriggers();
                    }
                }, 1500);
            }, 1000);
        } else {
            // Instant unlock
            overlay.style.display = 'none';
        }
    }

    // 3. Verification Logic
    async function verifyCode() {
        const code = input.value.trim().toUpperCase();

        if (!code) return;

        // Reset error
        errorMsg.classList.remove('visible');
        btnEnter.textContent = 'VERIFYING...';
        btnEnter.disabled = true;

        try {
            const response = await fetch('/api/access/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (data.success) {
                // Success!
                localStorage.setItem('arena_access_token', data.token);
                btnEnter.textContent = 'ACCESS GRANTED';
                btnEnter.style.backgroundColor = '#2ECC40';

                setTimeout(() => {
                    unlockGate(true);
                }, 500);
            } else {
                // Failure
                throw new Error(data.error || 'Invalid Code');
            }
        } catch (err) {
            errorMsg.textContent = err.message;
            errorMsg.classList.add('visible');
            btnEnter.textContent = 'ENTER ARENA';
            btnEnter.style.backgroundColor = ''; // Reset
            btnEnter.disabled = false;

            // Shake animation
            input.style.transform = 'translateX(10px)';
            setTimeout(() => input.style.transform = 'translateX(-10px)', 100);
            setTimeout(() => input.style.transform = 'translateX(10px)', 200);
            setTimeout(() => input.style.transform = 'none', 300);
        }
    }

    // 4. Event Listeners
    if (btnEnter) {
        btnEnter.addEventListener('click', verifyCode);
    }

    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') verifyCode();
        });
    }

    // Waitlist Integration
    if (waitlistTrigger) {
        waitlistTrigger.addEventListener('click', () => {
            waitlistContainer.classList.toggle('visible');
            if (waitlistContainer.classList.contains('visible')) {
                waitlistTrigger.textContent = "I HAVE A CODE";
                // Move the actual waitlist form here? 
                // Alternatively, we clone it or show a simplified message.
                // For now, we assume the markup is already there or we just show the prompt.
                moveWaitlistToGate();
            } else {
                waitlistTrigger.textContent = "JOIN THE LEGION (WAITLIST)";
            }
        });
    }

    function moveWaitlistToGate() {
        // Look for the main waitlist form
        const originalForm = document.getElementById('waitlist-form');
        const targetContainer = document.getElementById('gate-waitlist-target');

        if (originalForm && targetContainer && targetContainer.children.length === 0) {
            // Clone or move. Moving is better to keep IDs working, but might resize weirdly.
            // Let's clone and update IDs to avoid conflicts, OR just re-parent it.
            // Re-parenting:
            targetContainer.appendChild(originalForm);
        }
    }
});
