const MODEL_URL = '/assets/mascot/type2learn-companion.glb';
const DESKTOP_QUERY = '(min-width: 1181px)';
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const preferredClip = (clips, names) => names
  .map((name) => clips.find((clip) => clip.name === name))
  .find(Boolean) || clips[0] || null;

const reduceMotion = () => window.matchMedia?.(MOTION_QUERY)?.matches;
const supportsDesktopMascot = () => window.matchMedia?.(DESKTOP_QUERY)?.matches;

export const createCourseMascot = () => {
  let target = null;
  let three = null;
  let renderer = null;
  let camera = null;
  let scene = null;
  let mixer = null;
  let clock = null;
  let frame = null;
  let resizeObserver = null;
  let intersectionObserver = null;
  let isVisible = true;
  let isLoaded = false;
  let loading = null;
  let clips = [];
  let actions = new Map();
  let currentAction = null;
  let currentActionName = '';
  let presentation = { encouragement: 'balanced' };

  const releaseUnattachedStage = () => {
    cancelFrame();
    actions.forEach((action) => action.stop());
    actions.clear();
    mixer?.stopAllAction();
    renderer?.dispose();
    renderer?.domElement.remove();
    renderer = null;
    scene = null;
    camera = null;
    mixer = null;
    clock = null;
    clips = [];
    isLoaded = false;
    currentAction = null;
    currentActionName = '';
  };

  const cancelFrame = () => {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = null;
  };

  const motionAllowed = () => !reduceMotion()
    && !presentation.reducedMotion
    && presentation.animations !== 'still';
  const shouldRender = () => Boolean(target?.isConnected && renderer && scene && camera && isVisible);

  const renderFrame = () => {
    if (!shouldRender()) {
      cancelFrame();
      return;
    }
    const delta = Math.min(clock.getDelta(), .05);
    if (mixer && motionAllowed()) mixer.update(delta);
    renderer.render(scene, camera);
    // Do not keep a GPU loop alive while the companion is holding a pose.
    // A frame is scheduled only for the short, preloaded gesture currently
    // playing; resize and future gestures still render immediately.
    frame = currentAction?.isRunning?.() ? window.requestAnimationFrame(renderFrame) : null;
  };

  const startRendering = () => {
    if (frame || !shouldRender()) return;
    clock?.start();
    frame = window.requestAnimationFrame(renderFrame);
  };

  const resize = () => {
    if (!renderer || !camera || !target?.isConnected) return;
    const width = Math.max(1, target.clientWidth);
    const height = Math.max(1, target.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The mascot rail is intentionally tall. Pull the camera back slightly
    // when that rail becomes narrow (for example on 16:9 laptops) so waving
    // hands and feet never leave the visible frame.
    const preferredAspect = presentation.location === 'dashboard' ? .72 : .78;
    camera.position.z = 5.2 * Math.max(1, preferredAspect / camera.aspect);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const actionFor = (name) => {
    if (!mixer || !clips.length) return null;
    const clip = preferredClip(clips, [name]);
    if (!clip) return null;
    if (!actions.has(clip.name)) {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = true;
      action.setLoop(three.LoopOnce, 1);
      actions.set(clip.name, action);
    }
    return actions.get(clip.name);
  };

  const prewarmAnimations = () => {
    // All of the model's clips arrive in the same opt-in GLB. Instantiating
    // each action now means later supportive gestures never trigger a second
    // fetch or a first-use animation hitch.
    clips.forEach((clip) => {
      const action = actionFor(clip.name);
      if (!action) return;
      action.paused = true;
      action.play();
      action.stop();
    });
    mixer?.update(0);
  };

  const play = (name) => {
    if (!mixer || !motionAllowed()) return;
    const action = actionFor(name);
    if (!action || currentActionName === action.getClip().name && action.isRunning()) return;
    if (currentAction && currentAction !== action) currentAction.fadeOut(.18);
    action.reset();
    // Prewarming intentionally pauses an action. Explicitly release that
    // pause before every real gesture so the first-entry wave actually moves.
    action.paused = false;
    action.setEffectiveTimeScale(presentation.animations === 'gentle' ? .72 : 1);
    action.setEffectiveWeight(1);
    action.fadeIn(.18).play();
    currentAction = action;
    currentActionName = action.getClip().name;
    startRendering();
  };

  const rest = () => {
    if (!currentAction) return;
    currentAction.stop();
    currentAction = null;
    currentActionName = '';
    mixer?.update(0);
    if (renderer && scene && camera) renderer.render(scene, camera);
  };

  const presentScene = (sceneName) => {
    const clip = {
      dashboard: 'Big_Wave_Hello',
      browse: 'Walking',
      saved: 'Big_Wave_Hello',
      'course-preview': 'Big_Wave_Hello',
      'course-read': 'Big_Heart_Gesture',
      'course-type': '',
      'course-check': 'Big_Heart_Gesture',
      'course-apply': 'Big_Heart_Gesture',
      'course-complete': 'Cheer_with_Both_Hands',
      'course-exam-intro': 'Big_Wave_Hello',
      'course-exam': '',
      'course-exam-results': 'Cheer_with_Both_Hands'
    }[sceneName] || 'Big_Wave_Hello';
    if (clip) play(clip);
    else rest();
  };

  const createStage = async () => {
    if (isLoaded || loading || !supportsDesktopMascot()) return loading;
    loading = Promise.all([
      import('/vendor/three.module.min.js'),
      import('/vendor/GLTFLoader.js')
    ]).then(async ([THREE, { GLTFLoader }]) => {
      if (!target?.isConnected || !supportsDesktopMascot()) return;
      three = THREE;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      // Keep the model softly lit so its original texture, facial detail and
      // hoodie colour remain visible without the glossy, overlit look.
      // A small lift preserves the original hoodie and fur detail on bright
      // learning surfaces without returning to the earlier overlit look.
      renderer.toneMappingExposure = .96;
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.className = 'course-mascot-canvas';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      target.replaceChildren(renderer.domElement);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(27, 1, .1, 100);
      camera.position.set(0, 1.32, 5.2);
      camera.lookAt(0, 1.02, 0);
      clock = new THREE.Clock(false);

      scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x213b51, 1.35));
      const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
      keyLight.position.set(3.5, 5.5, 4.5);
      scene.add(keyLight);
      const colourLight = new THREE.PointLight(0x19c5b5, 3.2, 8, 2);
      colourLight.position.set(-3, 1.8, 2.6);
      scene.add(colourLight);

      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(MODEL_URL);
      if (!target?.isConnected || !renderer || !supportsDesktopMascot()) {
        releaseUnattachedStage();
        return;
      }
      const model = gltf.scene;
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.frustumCulled = false;
        child.castShadow = false;
        child.receiveShadow = false;
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      // Keep a generous margin around ears, hands, and feet instead of
      // filling the frame edge-to-edge. This stays intact across laptop
      // aspect ratios while still making the companion easy to see.
      const scale = (presentation.location === 'dashboard' ? 1.82 : 1.9) / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      // The supplied mesh is authored facing the camera at zero rotation.
      // Keeping that orientation makes the welcome wave read directly to the
      // learner instead of as a three-quarter pose.
      model.rotation.y = 0;
      // The rail itself sits on the far right. Offset the model inward, not
      // outward, so every gesture stays on-screen at every desktop ratio.
      model.position.x += presentation.location === 'dashboard' ? -.16 : -.2;
      scene.add(model);

      clips = gltf.animations || [];
      mixer = new THREE.AnimationMixer(model);
      prewarmAnimations();
      isLoaded = true;
      resize();
      // Mounting or rerendering must not replay a gesture. The course event
      // layer explicitly requests the one reaction earned by a learner action.
      startRendering();
    }).catch(() => {
      // The companion is optional. The course remains fully available when a
      // browser does not support WebGL or the asset cannot be downloaded.
      if (target?.isConnected) target.closest('[data-course-mascot]')?.setAttribute('data-mascot-unavailable', 'true');
    }).finally(() => { loading = null; });
    return loading;
  };

  const observe = () => {
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    if (!target) return;
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(target);
    intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) startRendering();
      else cancelFrame();
    }, { threshold: .01 });
    intersectionObserver.observe(target);
  };

  return {
    mount(nextTarget, nextPresentation = {}) {
      presentation = { ...presentation, ...nextPresentation };
      if (!nextTarget || !supportsDesktopMascot()) {
        this.unmount();
        return;
      }
      target = nextTarget;
      if (renderer?.domElement && renderer.domElement.parentElement !== target) target.replaceChildren(renderer.domElement);
      observe();
      if (isLoaded) {
        resize();
        startRendering();
      } else createStage();
    },
    celebrate() {
      if (presentation.encouragement === 'expressive') play('Cheer_with_Both_Hands');
      else if (presentation.encouragement === 'balanced') play('Big_Heart_Gesture');
    },
    wave() {
      if (presentation.encouragement !== 'subtle') play('Big_Wave_Hello');
    },
    present(sceneName) {
      presentation.scene = sceneName;
      presentScene(sceneName);
    },
    react(event) {
      if (!event || !motionAllowed()) {
        rest();
        return;
      }
      const level = event.encouragementLevel || presentation.encouragement || 'subtle';
      const behaviour = presentation.behaviour || 'calm';
      const kind = event.kind || '';
      // Recovery feedback is intentionally motionless. A wrong answer or a
      // loading problem never makes the companion shake, flinch, or perform a
      // disappointed reaction.
      if (['answer-incorrect', 'typing-incomplete', 'response-needed', 'system-error'].includes(kind) || level === 'subtle') {
        rest();
        return;
      }
      if (behaviour === 'low-key' && !['module-complete', 'course-complete'].includes(kind)) {
        rest();
        return;
      }
      if (['module-complete', 'course-complete'].includes(kind)) {
        play(level === 'expressive' ? 'Cheer_with_Both_Hands' : 'Big_Heart_Gesture');
        return;
      }
      if (kind === 'task-entry') {
        if (level === 'expressive' || (level === 'balanced' && event.result === 'module-entry')) play('Big_Wave_Hello');
        else rest();
        return;
      }
      if (['section-complete', 'answer-correct'].includes(kind)) {
        play('Big_Heart_Gesture');
        return;
      }
      rest();
    },
    unmount() {
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      resizeObserver = null;
      intersectionObserver = null;
      cancelFrame();
      target = null;
    },
    destroy() {
      this.unmount();
      releaseUnattachedStage();
      three = null;
    }
  };
};
