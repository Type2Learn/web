import * as THREE from '/vendor/three.module.min.js';

const startExperience = () => {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return;

  gsap.registerPlugin(ScrollTrigger);

  const motionIsOff = () => document.body.classList.contains('motion-off') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const activeScrollTriggers = [];
  let storyTimeline = null;
  let renderPath = null;

  const buildThreePath = () => {
    const canvas = document.getElementById('story-canvas');
    if (!canvas) return null;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (error) {
      canvas.hidden = true;
      return null;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 3.5, -3.5, .1, 20);
    camera.position.z = 8;

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-5.6, -2.45, 0),
      new THREE.Vector3(-3.6, -1.55, 0),
      new THREE.Vector3(-1.5, -2.05, 0),
      new THREE.Vector3(.7, -1.08, 0),
      new THREE.Vector3(2.8, -1.55, 0),
      new THREE.Vector3(5.7, -.65, 0)
    ]);

    const pathPoints = curve.getPoints(180);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    pathGeometry.setDrawRange(0, 1);
    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x19bdeb, transparent: true, opacity: .9 });
    const path = new THREE.Line(pathGeometry, pathMaterial);
    scene.add(path);

    const keyGeometry = new THREE.BoxGeometry(.56, .34, .12);
    const keyMaterials = [0x19c85a, 0x19c5b5, 0x19bdeb, 0x1769f5];
    const keys = Array.from({ length: 7 }, (_, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: keyMaterials[index % keyMaterials.length],
        transparent: true,
        opacity: .18
      });
      const key = new THREE.Mesh(keyGeometry, material);
      const point = curve.getPoint(index / 6);
      key.position.copy(point);
      key.position.y += .02;
      key.rotation.z = (index % 2 ? -.07 : .07);
      key.scale.setScalar(.72);
      scene.add(key);
      return key;
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      camera.left = -4.2 * aspect;
      camera.right = 4.2 * aspect;
      camera.top = 4.2;
      camera.bottom = -4.2;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    const render = (progress = 0) => {
      const clamped = Math.min(Math.max(progress, 0), 1);
      pathGeometry.setDrawRange(0, Math.max(1, Math.floor(pathPoints.length * clamped)));
      keys.forEach((key, index) => {
        const threshold = index / 6;
        const reached = clamped >= threshold - .015;
        key.material.opacity = reached ? .95 : .16;
        key.scale.setScalar(reached ? 1 : .72);
      });
      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    render(0);
    return render;
  };

  const setStoryState = (progress) => {
    const steps = Array.from(document.querySelectorAll('[data-story-step]'));
    const scenes = Array.from(document.querySelectorAll('[data-story-scene]'));
    const current = Math.min(steps.length - 1, Math.max(0, Math.round(progress * (steps.length - 1))));
    steps.forEach((step, index) => step.classList.toggle('is-active', index === current));
    scenes.forEach((scene, index) => scene.classList.toggle('is-active', index === current));
    const counter = document.getElementById('story-current');
    const routeProgress = document.getElementById('story-route-progress');
    if (counter) counter.textContent = String(current + 1).padStart(2, '0');
    if (routeProgress) routeProgress.style.transform = 'scaleX(' + progress.toFixed(4) + ')';
    if (renderPath) renderPath(progress);
  };

  const setupStory = () => {
    const story = document.querySelector('.scroll-story');
    const stage = story && story.querySelector('.story-stage');
    if (!story || !stage || motionIsOff()) return;

    const scenes = gsap.utils.toArray('.story-scene');
    const steps = gsap.utils.toArray('.story-step');
    renderPath = buildThreePath();

    gsap.set(scenes, { autoAlpha: 0, scale: 1.055 });
    gsap.set(scenes[0], { autoAlpha: 1, scale: 1 });
    gsap.set(steps, { autoAlpha: 0, y: 44 });
    gsap.set(steps[0], { autoAlpha: 1, y: 0 });

    storyTimeline = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: story,
        start: 'top top',
        end: () => '+=' + Math.max(window.innerHeight * (scenes.length + .35), 4200),
        pin: stage,
        scrub: .75,
        anticipatePin: 1,
        refreshPriority: 10,
        invalidateOnRefresh: true,
        onUpdate: (self) => setStoryState(self.progress)
      }
    });

    storyTimeline.to({}, { duration: .28 });
    for (let index = 1; index < scenes.length; index += 1) {
      storyTimeline
        .to(steps[index - 1], { autoAlpha: 0, y: -42, duration: .12 })
        .to(scenes[index - 1], { autoAlpha: 0, scale: 1.02, duration: .15 }, '<')
        .to(scenes[index], { autoAlpha: 1, scale: 1, duration: .18 })
        .to(steps[index], { autoAlpha: 1, y: 0, duration: .16 }, '<+.03')
        .to({}, { duration: .28 });
    }
    storyTimeline.to({}, { duration: .18 });

    activeScrollTriggers.push(storyTimeline.scrollTrigger);
  };

  const setupSectionMotion = () => {
    if (motionIsOff()) return;

    gsap.utils.toArray('.section-heading, .page-section > .content-wrap > h2').forEach((element) => {
      const tween = gsap.fromTo(element,
        { y: 64, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: element, start: 'top 86%', once: true }
        }
      );
      if (tween.scrollTrigger) activeScrollTriggers.push(tween.scrollTrigger);
    });

    const anaphora = document.querySelector('.anaphora-heading');
    if (anaphora) {
      const section = anaphora.closest('.anaphora-section');
      const panel = anaphora.closest('.anaphora-panel');
      const lines = Array.from(anaphora.querySelectorAll('.anaphora-lines > span'));
      const controls = Array.from(panel ? panel.querySelectorAll('.support-item') : []);
      const drop = anaphora.querySelector('.anaphora-drop');
      gsap.set(drop, { clipPath: 'inset(100% 0 0 0)' });
      gsap.set(lines, { xPercent: -7, autoAlpha: 0 });
      gsap.set(controls, { y: 72, rotationX: 68, autoAlpha: 0, transformOrigin: '50% 100%' });
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section || anaphora,
          start: 'top top+=74',
          end: () => '+=' + Math.max(window.innerHeight * 2.35, 1800),
          pin: section || panel || false,
          scrub: .48,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });
      timeline.to(drop, { clipPath: 'inset(0% 0 0 0)', duration: .18, ease: 'none' });
      lines.forEach((line) => {
        timeline
          .to(line, { xPercent: 0, autoAlpha: 1, duration: .18, ease: 'none' })
          .to({}, { duration: .16 });
      });
      timeline.to(controls, { y: 0, rotationX: 0, autoAlpha: 1, stagger: .08, duration: .32, ease: 'power2.out' });
      timeline.to({}, { duration: .16 });
      activeScrollTriggers.push(timeline.scrollTrigger);
    }

    gsap.utils.toArray('.support-panel:not(.anaphora-panel)').forEach((panel) => {
      const items = panel.querySelectorAll('.support-item');
      if (!items.length) return;
      const tween = gsap.fromTo(items,
        { y: 70, rotationX: 62, autoAlpha: 0, transformOrigin: '50% 100%' },
        {
          y: 0,
          rotationX: 0,
          autoAlpha: 1,
          stagger: .12,
          duration: .85,
          ease: 'power3.out',
          scrollTrigger: { trigger: panel, start: 'top 76%', once: true }
        }
      );
      if (tween.scrollTrigger) activeScrollTriggers.push(tween.scrollTrigger);
    });

    gsap.utils.toArray('[data-team-feature]').forEach((feature) => {
      const visual = feature.matches('figure') ? feature : feature.querySelector('figure');
      const image = visual && visual.querySelector('img');
      const copy = feature.querySelector('.founder-copy');
      if (!visual || !image) return;
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: feature,
          start: 'top 88%',
          end: 'center 46%',
          scrub: .55
        }
      });
      timeline
        .fromTo(visual, { clipPath: 'inset(0 100% 0 0 round 22px)' }, { clipPath: 'inset(0 0% 0 0 round 22px)', ease: 'none' }, 0)
        .fromTo(image, { scale: 1.12 }, { scale: 1, ease: 'none' }, 0);
      if (copy) timeline.fromTo(copy, { x: 70, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: 'none' }, .12);
      activeScrollTriggers.push(timeline.scrollTrigger);
    });
  };

  setupStory();
  setupSectionMotion();
  window.setTimeout(() => ScrollTrigger.refresh(), 120);

  window.addEventListener('type2learn:motion', (event) => {
    const off = Boolean(event.detail && event.detail.off);
    activeScrollTriggers.forEach((trigger) => {
      if (!trigger) return;
      if (off) trigger.disable(false, true);
      else trigger.enable(false, true);
    });
    const canvas = document.getElementById('story-canvas');
    if (canvas) canvas.hidden = off;
    if (off) {
      gsap.set('.story-scene, .story-step, .section-heading, .anaphora-panel, .anaphora-drop, .anaphora-lines > span, .support-item, [data-team-feature], [data-team-feature] img, .founder-copy', { clearProps: 'all' });
      setStoryState(0);
    } else {
      ScrollTrigger.refresh();
    }
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startExperience, { once: true });
else startExperience();
