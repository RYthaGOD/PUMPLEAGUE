document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger);

    const stages = document.querySelectorAll('.mechanic-stage');

    // Create a master timeline for the pinned section
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: ".mechanics-wrapper",
            start: "top top",
            end: "+=3000", // 1000px per stage
            scrub: 1,
            pin: true,
            anticipatePin: 1
        }
    });

    // --- STAGE 1: THE FORGE ---
    // Fade in
    tl.to(stages[0], { autoAlpha: 1, duration: 0.5 })
        .fromTo(".token-forge", { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 1 }, "<")
        .fromTo(".forge-core", { opacity: 0 }, { opacity: 1, duration: 0.5 }, "-=0.5")
        // Hold Stage 1
        .to({}, { duration: 0.5 })
        // Fade out
        .to(stages[0], { autoAlpha: 0, scale: 1.1, duration: 0.5 });


    // --- STAGE 2: THE SKIRMISH ---
    // Fade in
    tl.to(stages[1], { autoAlpha: 1, duration: 0.5 })
        .fromTo(".mechanic-title-2", { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "<")
        // Animate Bars
        .to(".bar-blue", { height: "100%", duration: 1, ease: "power2.out" }, "-=0.2")
        .to(".bar-red", { height: "60%", duration: 1, ease: "power2.out" }, "<")
        // Hold Stage 2
        .to({}, { duration: 0.5 })
        // Fade out
        .to(stages[1], { autoAlpha: 0, x: -50, duration: 0.5 });


    // --- STAGE 3: THE TRIBUTE ---
    // Fade in
    tl.to(stages[2], { autoAlpha: 1, duration: 0.5 })
        .fromTo(".tribute-chest", { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, "<")
        // Stream animations
        .fromTo(".sol-stream",
            { height: 0, opacity: 0 },
            { height: 100, opacity: 1, duration: 0.5, stagger: 0.1 }
        )
        // Glow pulse
        .to(".tribute-chest", {
            boxShadow: "0 0 60px rgba(0, 242, 255, 0.6)",
            borderColor: "#00f2ff",
            duration: 0.5
        })
        // Hold Stage 3
        .to({}, { duration: 0.5 });

});
