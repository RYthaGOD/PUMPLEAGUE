/**
 * Enhanced Battle Effects
 * Additional visual effects for intense combat atmosphere
 */

// Add to existing animations.js or create new file

// Energy Beam Effects
function createEnergyBeam(startX, startY, endX, endY) {
    const beam = document.createElement('div');
    beam.className = 'energy-beam';

    const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const angle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;

    beam.style.cssText = `
        position: fixed;
        left: ${startX}px;
        top: ${startY}px;
        width: ${length}px;
        height: 3px;
        background: linear-gradient(90deg, 
            transparent, 
            rgba(255, 215, 0, 0.8) 20%, 
            rgba(255, 51, 51, 0.8) 50%, 
            rgba(255, 215, 0, 0.8) 80%, 
            transparent
        );
        transform: rotate(${angle}deg);
        transform-origin: 0 50%;
        box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
        pointer-events: none;
        z-index: 2;
    `;

    document.body.appendChild(beam);

    // Animate and remove
    gsap.to(beam, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => beam.remove()
    });
}

// Screen Shake Effect
function screenShake(intensity = 10, duration = 0.3) {
    const body = document.body;

    gsap.to(body, {
        x: `+=${Math.random() * intensity - intensity / 2}`,
        y: `+=${Math.random() * intensity - intensity / 2}`,
        duration: 0.05,
        repeat: 5,
        yoyo: true,
        ease: 'power1.inOut',
        onComplete: () => {
            gsap.set(body, { x: 0, y: 0 });
        }
    });
}

// Ambient Dust Particles
class DustParticles {
    constructor() {
        this.particles = [];
        this.maxParticles = 30;
        this.createParticles();
        this.animate();
    }

    createParticles() {
        for (let i = 0; i < this.maxParticles; i++) {
            const particle = document.createElement('div');
            particle.className = 'dust-particle';
            particle.style.cssText = `
                position: fixed;
                width: ${2 + Math.random() * 3}px;
                height: ${2 + Math.random() * 3}px;
                background: rgba(255, 215, 0, ${0.1 + Math.random() * 0.2});
                border-radius: 50%;
                pointer-events: none;
                z-index: 1;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
            `;

            document.body.appendChild(particle);
            this.particles.push({
                element: particle,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5
            });
        }
    }

    animate() {
        this.particles.forEach(p => {
            const rect = p.element.getBoundingClientRect();
            let x = rect.left + p.vx;
            let y = rect.top + p.vy;

            // Wrap around screen
            if (x < 0) x = window.innerWidth;
            if (x > window.innerWidth) x = 0;
            if (y < 0) y = window.innerHeight;
            if (y > window.innerHeight) y = 0;

            p.element.style.left = x + 'px';
            p.element.style.top = y + 'px';
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Initialize enhanced effects
window.addEventListener('load', () => {
    new DustParticles();

    // Random energy beams
    setInterval(() => {
        const x1 = Math.random() * window.innerWidth;
        const y1 = Math.random() * window.innerHeight;
        const x2 = Math.random() * window.innerWidth;
        const y2 = Math.random() * window.innerHeight;

        createEnergyBeam(x1, y1, x2, y2);
    }, 8000 + Math.random() * 4000);

    // Random screen shakes (subtle)
    setInterval(() => {
        screenShake(5, 0.2);
    }, 15000 + Math.random() * 10000);
});

// Export for use in other scripts
window.battleEffects = {
    createEnergyBeam,
    screenShake
};
