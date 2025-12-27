/**
 * Coliseum Battle System - Enhanced
 * Authentic gladiatorial combat with arena structure
 */

class ColiseumArena {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gladiators = [];
        this.particles = [];
        this.crowdWaves = [];
        this.arenaFloor = null;
        this.init();
    }

    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'coliseum-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            opacity: 0.7;
        `;

        document.body.insertBefore(this.canvas, document.body.firstChild);
        this.ctx = this.canvas.getContext('2d');
        this.resize();

        window.addEventListener('resize', () => this.resize());

        // Initialize arena
        this.createArenaStructure();
        this.createGladiators();
        this.startCombat();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.arenaFloor = this.canvas.height * 0.7; // Arena floor at 70% down
    }

    createArenaStructure() {
        // Arena floor will be drawn each frame
        this.arenaFloorY = this.canvas.height * 0.7;
    }

    createGladiators() {
        const gladiatorTypes = [
            { name: '⚔️', color: '#ff3333', type: 'Warrior' },
            { name: '🛡️', color: '#4169e1', type: 'Defender' },
            { name: '🏹', color: '#32cd32', type: 'Archer' },
            { name: '⚡', color: '#ffd700', type: 'Mage' },
            { name: '🔥', color: '#ff6347', type: 'Berserker' },
            { name: '💎', color: '#00ced1', type: 'Champion' }
        ];

        const count = 6;
        for (let i = 0; i < count; i++) {
            const type = gladiatorTypes[i % gladiatorTypes.length];
            const side = i % 2 === 0 ? 'left' : 'right';

            this.gladiators.push({
                x: side === 'left' ? 100 + Math.random() * 200 : this.canvas.width - 300 + Math.random() * 200,
                y: this.arenaFloorY - 50,
                vx: 0,
                vy: 0,
                symbol: type.name,
                color: type.color,
                type: type.type,
                size: 30,
                health: 100,
                maxHealth: 100,
                stance: 'idle', // idle, attacking, defending, defeated
                side: side,
                targetX: null,
                targetY: null,
                rotation: 0,
                scale: 1,
                glowIntensity: 0.5
            });
        }
    }

    drawArenaStructure() {
        const ctx = this.ctx;

        // Arena floor (sand)
        const gradient = ctx.createLinearGradient(0, this.arenaFloorY, 0, this.canvas.height);
        gradient.addColorStop(0, 'rgba(139, 90, 43, 0.3)');
        gradient.addColorStop(1, 'rgba(101, 67, 33, 0.5)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, this.arenaFloorY, this.canvas.width, this.canvas.height - this.arenaFloorY);

        // Arena floor line
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, this.arenaFloorY);
        ctx.lineTo(this.canvas.width, this.arenaFloorY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Coliseum walls (left and right)
        this.drawWall(0, 0, 80, this.canvas.height);
        this.drawWall(this.canvas.width - 80, 0, 80, this.canvas.height);

        // Center line
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 10]);
        ctx.beginPath();
        ctx.moveTo(this.canvas.width / 2, this.arenaFloorY - 100);
        ctx.lineTo(this.canvas.width / 2, this.arenaFloorY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawWall(x, y, width, height) {
        const ctx = this.ctx;

        // Stone wall gradient
        const gradient = ctx.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, 'rgba(80, 80, 80, 0.2)');
        gradient.addColorStop(0.5, 'rgba(100, 100, 100, 0.3)');
        gradient.addColorStop(1, 'rgba(80, 80, 80, 0.2)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, height);

        // Stone blocks
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < height; i += 40) {
            ctx.beginPath();
            ctx.moveTo(x, y + i);
            ctx.lineTo(x + width, y + i);
            ctx.stroke();
        }
    }

    drawGladiator(glad) {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(glad.x, glad.y);
        ctx.scale(glad.scale, glad.scale);
        ctx.rotate(glad.rotation);

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 20, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glow based on stance
        if (glad.stance === 'attacking') {
            ctx.shadowBlur = 30;
            ctx.shadowColor = glad.color;
        } else if (glad.stance === 'defending') {
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#4169e1';
        } else {
            ctx.shadowBlur = 15 * glad.glowIntensity;
            ctx.shadowColor = glad.color;
        }

        // Gladiator symbol
        ctx.font = `${glad.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glad.symbol, 0, 0);

        ctx.restore();

        // Health bar
        this.drawHealthBar(glad);

        // Stance indicator
        if (glad.stance === 'attacking') {
            this.drawAttackAura(glad);
        } else if (glad.stance === 'defending') {
            this.drawDefenseShield(glad);
        }
    }

    drawHealthBar(glad) {
        const ctx = this.ctx;
        const barWidth = 40;
        const barHeight = 4;
        const x = glad.x - barWidth / 2;
        const y = glad.y - 30;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);

        // Health
        const healthPercent = glad.health / glad.maxHealth;
        const healthColor = healthPercent > 0.5 ? '#32cd32' : healthPercent > 0.25 ? '#ffa500' : '#ff3333';
        ctx.fillStyle = healthColor;
        ctx.fillRect(x, y, barWidth * healthPercent, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth, barHeight);
    }

    drawAttackAura(glad) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = glad.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(glad.x, glad.y, 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    drawDefenseShield(glad) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#4169e1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(glad.x, glad.y, 35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    startCombat() {
        // Periodic combat sequences
        setInterval(() => {
            this.initiateGladiatorClash();
        }, 4000 + Math.random() * 3000);

        // Crowd cheering
        setInterval(() => {
            this.createCrowdWave();
        }, 6000 + Math.random() * 4000);
    }

    initiateGladiatorClash() {
        // Pick two gladiators from opposite sides
        const leftGlads = this.gladiators.filter(g => g.side === 'left' && g.health > 0);
        const rightGlads = this.gladiators.filter(g => g.side === 'right' && g.health > 0);

        if (leftGlads.length === 0 || rightGlads.length === 0) return;

        const glad1 = leftGlads[Math.floor(Math.random() * leftGlads.length)];
        const glad2 = rightGlads[Math.floor(Math.random() * rightGlads.length)];

        // Move toward center
        const centerX = this.canvas.width / 2;
        const centerY = this.arenaFloorY - 50;

        glad1.stance = 'attacking';
        glad2.stance = 'defending';

        // Animate movement
        gsap.to(glad1, {
            x: centerX - 40,
            y: centerY,
            duration: 0.8,
            ease: 'power2.inOut',
            onComplete: () => {
                this.executeClash(glad1, glad2, centerX, centerY);
            }
        });

        gsap.to(glad2, {
            x: centerX + 40,
            y: centerY,
            duration: 0.8,
            ease: 'power2.inOut'
        });
    }

    executeClash(glad1, glad2, x, y) {
        // Clash effect
        this.createClashEffect(x, y);

        // Damage
        const damage = 10 + Math.random() * 20;
        glad2.health = Math.max(0, glad2.health - damage);

        // Screen shake
        if (window.battleEffects) {
            window.battleEffects.screenShake(8, 0.2);
        }

        // Victory/defeat
        if (glad2.health <= 0) {
            this.gladiatorDefeated(glad2);
            this.gladiatorVictory(glad1);
        } else {
            // Return to positions
            setTimeout(() => {
                this.returnToPosition(glad1);
                this.returnToPosition(glad2);
            }, 500);
        }
    }

    gladiatorDefeated(glad) {
        glad.stance = 'defeated';

        // Fall animation
        gsap.to(glad, {
            rotation: Math.PI / 2,
            scale: 0.8,
            y: glad.y + 20,
            duration: 0.5,
            ease: 'power2.in'
        });

        // Fade out
        setTimeout(() => {
            gsap.to(glad, {
                scale: 0,
                duration: 1,
                onComplete: () => {
                    // Respawn after delay
                    setTimeout(() => this.respawnGladiator(glad), 5000);
                }
            });
        }, 2000);
    }

    gladiatorVictory(glad) {
        glad.stance = 'idle';

        // Victory animation
        gsap.to(glad, {
            scale: 1.2,
            duration: 0.3,
            yoyo: true,
            repeat: 1
        });

        // Particle burst
        this.createVictoryBurst(glad.x, glad.y, glad.color);
    }

    respawnGladiator(glad) {
        glad.health = glad.maxHealth;
        glad.stance = 'idle';
        glad.rotation = 0;
        glad.scale = 1;

        // Respawn at original side
        glad.x = glad.side === 'left' ? 100 + Math.random() * 200 : this.canvas.width - 300 + Math.random() * 200;
        glad.y = this.arenaFloorY - 50;
    }

    returnToPosition(glad) {
        glad.stance = 'idle';
        const targetX = glad.side === 'left' ? 100 + Math.random() * 200 : this.canvas.width - 300 + Math.random() * 200;

        gsap.to(glad, {
            x: targetX,
            y: this.arenaFloorY - 50,
            duration: 1,
            ease: 'power2.out'
        });
    }

    createClashEffect(x, y) {
        // Shockwave
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const ring = {
                    x, y,
                    radius: 0,
                    maxRadius: 80 + i * 20,
                    opacity: 0.8,
                    color: i % 2 === 0 ? '#ff3333' : '#ffd700'
                };

                gsap.to(ring, {
                    radius: ring.maxRadius,
                    opacity: 0,
                    duration: 0.6,
                    ease: 'power2.out',
                    onUpdate: () => {
                        this.ctx.save();
                        this.ctx.globalAlpha = ring.opacity;
                        this.ctx.strokeStyle = ring.color;
                        this.ctx.lineWidth = 3;
                        this.ctx.shadowBlur = 15;
                        this.ctx.shadowColor = ring.color;
                        this.ctx.beginPath();
                        this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
                        this.ctx.stroke();
                        this.ctx.restore();
                    }
                });
            }, i * 100);
        }

        // Particles
        this.createParticleBurst(x, y, 30);
    }

    createVictoryBurst(x, y, color) {
        for (let i = 0; i < 20; i++) {
            const angle = (Math.PI * 2 * i) / 20;
            const speed = 3 + Math.random() * 2;

            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 1.0,
                color: color,
                size: 3 + Math.random() * 2
            });
        }
    }

    createParticleBurst(x, y, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;

            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color: Math.random() > 0.5 ? '#ffd700' : '#ff3333',
                size: 2 + Math.random() * 3
            });
        }
    }

    createCrowdWave() {
        // Crowd cheering from sides
        const side = Math.random() > 0.5 ? 'left' : 'right';
        const x = side === 'left' ? 50 : this.canvas.width - 50;

        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                this.particles.push({
                    x: x + (Math.random() - 0.5) * 40,
                    y: Math.random() * this.arenaFloorY,
                    vx: (side === 'left' ? 1 : -1) * (1 + Math.random()),
                    vy: -1 - Math.random(),
                    life: 1.0,
                    color: '#ffd700',
                    size: 2
                });
            }, i * 50);
        }
    }

    updateParticles() {
        this.particles = this.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1; // Gravity
            p.life -= 0.02;
            return p.life > 0;
        });
    }

    updateGladiators() {
        this.gladiators.forEach(glad => {
            // Idle animation
            if (glad.stance === 'idle') {
                glad.glowIntensity = 0.5 + Math.sin(Date.now() * 0.002 + glad.x) * 0.3;
            }
        });
    }

    drawParticles() {
        this.particles.forEach(p => {
            this.ctx.save();
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw arena structure
        this.drawArenaStructure();

        // Update and draw
        this.updateGladiators();
        this.updateParticles();

        this.gladiators.forEach(glad => this.drawGladiator(glad));
        this.drawParticles();

        requestAnimationFrame(() => this.animate());
    }
}

// Replace old BattleBackground with ColiseumArena
window.addEventListener('load', () => {
    new ColiseumArena();
});
