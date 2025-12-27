/**
 * GSAP Animations for PumpLeague Gladiator Arena
 * Creates a cinematic, engaging landing page experience
 */

// Register ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);

// ============ INITIALIZATION ============

function initAnimations() {
    // Set initial states (hidden before animation)
    gsap.set('.arena-title', { opacity: 0, y: 100, scale: 0.8 });
    gsap.set('.arena-subtitle', { opacity: 0, y: 50 });
    gsap.set('.integration-slab', { opacity: 0, scale: 0.9 });
    gsap.set('.stat-orb', { opacity: 0, y: 30 });
    gsap.set('.nav-links a', { opacity: 0, y: -20 });
    gsap.set('.arena-logo', { opacity: 0, x: -30 });

    // Start animations after page load
    window.addEventListener('load', () => {
        playEntranceSequence();
        setupScrollAnimations();
        setupInteractiveEffects();
        setupPodiumAnimations();
        setupWarboardAnimations();
    });
}

// ============ ENTRANCE SEQUENCE ============

function playEntranceSequence() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // 1. Logo and nav fade in
    tl.to('.arena-logo', {
        opacity: 1,
        x: 0,
        duration: 0.8
    })
        .to('.nav-links a', {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.1
        }, '-=0.4')

        // 2. Hero title dramatic entrance
        .to('.arena-title', {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 1.2,
            ease: 'back.out(1.4)'
        }, '-=0.2')

        // 3. Subtitle fade in
        .to('.arena-subtitle', {
            opacity: 1,
            y: 0,
            duration: 0.8
        }, '-=0.6')

        // 4. Integration slab pop in
        .to('.integration-slab', {
            opacity: 1,
            scale: 1,
            duration: 0.6,
            ease: 'back.out(1.2)'
        }, '-=0.4')

        // 5. Stats orbs stagger in
        .to('.stat-orb', {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.15,
            ease: 'back.out(1.1)'
        }, '-=0.3');

    // Add pulsing glow to title
    gsap.to('.arena-title', {
        textShadow: '0 0 30px rgba(255, 215, 0, 0.6)',
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });
}

// ============ SCROLL ANIMATIONS ============

function setupScrollAnimations() {
    // Podium section reveal
    gsap.from('.champion-podium', {
        scrollTrigger: {
            trigger: '.podium-section',
            start: 'top 80%',
            end: 'top 20%',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        y: 100,
        duration: 1,
        ease: 'power2.out'
    });

    // Warboard section
    gsap.from('.iron-container', {
        scrollTrigger: {
            trigger: '.slab-section',
            start: 'top 75%',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        y: 80,
        duration: 1,
        ease: 'power2.out'
    });

    // Hall of Heroes cards
    gsap.from('.hero-card', {
        scrollTrigger: {
            trigger: '#hall-of-heroes',
            start: 'top 70%',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        y: 50,
        stagger: 0.2,
        duration: 0.8,
        ease: 'power2.out'
    });

    // Commissioner box
    gsap.from('.commissioner-orb', {
        scrollTrigger: {
            trigger: '#commissioner-box',
            start: 'top 70%',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        scale: 0.9,
        duration: 1,
        ease: 'back.out(1.2)'
    });

    // Armory cards
    gsap.from('.armor-card', {
        scrollTrigger: {
            trigger: '.armory-section',
            start: 'top 70%',
            toggleActions: 'play none none reverse'
        },
        opacity: 0,
        y: 60,
        stagger: 0.15,
        duration: 0.8,
        ease: 'power2.out'
    });

    // Blood glow parallax effect
    gsap.to('.blood-glow', {
        scrollTrigger: {
            trigger: 'body',
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1
        },
        y: 200,
        opacity: 0.5
    });
}

// ============ INTERACTIVE EFFECTS ============

function setupInteractiveEffects() {
    // Nav links hover
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('mouseenter', function () {
            gsap.to(this, {
                scale: 1.1,
                color: '#ffd700',
                duration: 0.3,
                ease: 'power2.out'
            });
        });

        link.addEventListener('mouseleave', function () {
            gsap.to(this, {
                scale: 1,
                color: '',
                duration: 0.3,
                ease: 'power2.out'
            });
        });
    });

    // Stat orbs hover effect
    document.querySelectorAll('.stat-orb').forEach(orb => {
        orb.addEventListener('mouseenter', function () {
            gsap.to(this, {
                scale: 1.05,
                y: -5,
                duration: 0.3,
                ease: 'back.out(1.5)'
            });

            gsap.to(this.querySelector('.stat-value'), {
                color: '#ffd700',
                scale: 1.1,
                duration: 0.3
            });
        });

        orb.addEventListener('mouseleave', function () {
            gsap.to(this, {
                scale: 1,
                y: 0,
                duration: 0.3,
                ease: 'power2.out'
            });

            gsap.to(this.querySelector('.stat-value'), {
                color: '',
                scale: 1,
                duration: 0.3
            });
        });
    });

    // Armor cards hover
    document.querySelectorAll('.armor-card').forEach(card => {
        card.addEventListener('mouseenter', function () {
            gsap.to(this, {
                y: -10,
                boxShadow: '0 20px 40px rgba(255, 215, 0, 0.2)',
                duration: 0.4,
                ease: 'power2.out'
            });

            gsap.to(this.querySelector('.icon'), {
                scale: 1.2,
                rotation: 360,
                duration: 0.6,
                ease: 'back.out(1.5)'
            });
        });

        card.addEventListener('mouseleave', function () {
            gsap.to(this, {
                y: 0,
                boxShadow: '',
                duration: 0.4,
                ease: 'power2.out'
            });

            gsap.to(this.querySelector('.icon'), {
                scale: 1,
                rotation: 0,
                duration: 0.6,
                ease: 'power2.out'
            });
        });
    });

    // Integration slab pulse on hover
    const slab = document.querySelector('.integration-slab');
    if (slab) {
        slab.addEventListener('mouseenter', function () {
            gsap.to(this, {
                scale: 1.02,
                boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)',
                duration: 0.3
            });
        });

        slab.addEventListener('mouseleave', function () {
            gsap.to(this, {
                scale: 1,
                boxShadow: '',
                duration: 0.3
            });
        });
    }
}

// ============ PODIUM ANIMATIONS ============

function setupPodiumAnimations() {
    // Animate podium places rising from the ground
    const podiumObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animatePodiumRise();
                podiumObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    const podium = document.querySelector('.champion-podium');
    if (podium) {
        podiumObserver.observe(podium);
    }
}

function animatePodiumRise() {
    const places = document.querySelectorAll('.podium-place');
    if (places.length === 0) return;

    // Set initial state
    gsap.set(places, { opacity: 0, y: 100 });

    // Animate in order: 2nd, 1st, 3rd (visual order)
    const tl = gsap.timeline();

    places.forEach((place, index) => {
        tl.to(place, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'back.out(1.5)',
            onComplete: () => {
                // Add floating animation
                gsap.to(place, {
                    y: -10,
                    duration: 2,
                    repeat: -1,
                    yoyo: true,
                    ease: 'sine.inOut',
                    delay: index * 0.3
                });
            }
        }, index * 0.2);
    });
}

// ============ WARBOARD ANIMATIONS ============

function setupWarboardAnimations() {
    // Animate table rows on scroll
    const rows = document.querySelectorAll('.war-table tbody tr');

    if (rows.length > 0) {
        gsap.from(rows, {
            scrollTrigger: {
                trigger: '.war-table',
                start: 'top 70%',
                toggleActions: 'play none none reverse'
            },
            opacity: 0,
            x: -50,
            stagger: 0.05,
            duration: 0.6,
            ease: 'power2.out'
        });

        // Add hover effect to rows
        rows.forEach(row => {
            row.addEventListener('mouseenter', function () {
                gsap.to(this, {
                    backgroundColor: 'rgba(255, 215, 0, 0.05)',
                    x: 5,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });

            row.addEventListener('mouseleave', function () {
                gsap.to(this, {
                    backgroundColor: '',
                    x: 0,
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });
        });
    }
}

// ============ CONTINUOUS ANIMATIONS ============

function setupContinuousAnimations() {
    // Rotating glow on arena logo
    gsap.to('.arena-logo span', {
        textShadow: '0 0 20px rgba(255, 215, 0, 0.8)',
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });

    // Pulsing effect on status badge
    gsap.to('.round-status-badge', {
        opacity: 0.7,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
    });
}

// ============ UTILITY FUNCTIONS ============

// Refresh ScrollTrigger when data updates
function refreshScrollTriggers() {
    ScrollTrigger.refresh();
}

// Add this to your existing data update function
function onDataUpdate() {
    // Your existing update logic...

    // Refresh scroll triggers after DOM updates
    setTimeout(() => {
        refreshScrollTriggers();
    }, 100);
}

// ============ INITIALIZE ============

// Start animations when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAnimations);
} else {
    initAnimations();
}

// Setup continuous animations
setupContinuousAnimations();

// Export for use in app.js
window.arenaAnimations = {
    refreshScrollTriggers,
    animatePodiumRise
};
