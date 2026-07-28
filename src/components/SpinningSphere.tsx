import { onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import "./SpinningSphere.css";

export default function SpinningSphere() {
    let canvas!: HTMLCanvasElement;

    onMount(() => {
        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: false,
            antialias: true,
            powerPreference: "high-performance",
        });
        renderer.setClearColor(0x202628, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 30);

        const tiltGroup = new THREE.Group();
        scene.add(tiltGroup);

        // The camera lives inside the sphere, making the texture an immersive
        // surface that always extends beyond every edge of the viewport.
        const geometry = new THREE.SphereGeometry(8, 96, 64);
        const texture = new THREE.TextureLoader().load("/pattern.png");
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const baseColor = new THREE.Color("#202628");
        const patternColor = new THREE.Color("#681f22");
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
        });
        material.onBeforeCompile = (shader) => {
            shader.uniforms.sphereBaseColor = { value: baseColor };
            shader.uniforms.spherePatternColor = { value: patternColor };
            shader.fragmentShader = `
                uniform vec3 sphereBaseColor;
                uniform vec3 spherePatternColor;
            ${shader.fragmentShader}`.replace(
                "#include <map_fragment>",
                `
                #ifdef USE_MAP
                    vec4 sampledDiffuseColor = texture2D(map, vMapUv);
                    float redBias = sampledDiffuseColor.r -
                        max(sampledDiffuseColor.g, sampledDiffuseColor.b);
                    float patternMask = smoothstep(0.0015, 0.035, redBias);
                    diffuseColor.rgb = mix(
                        sphereBaseColor,
                        spherePatternColor,
                        patternMask
                    );
                #endif
                `,
            );
        };
        material.customProgramCacheKey = () => "tan-pattern-sphere-v1";

        const sphere = new THREE.Mesh(geometry, material);
        sphere.rotation.x = -0.08;
        tiltGroup.add(sphere);

        const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
        let animationFrame = 0;
        let previousTime = performance.now();
        let spin = 0;

        const resize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };

        const draw = (time: number) => {
            const elapsed = time / 1000;
            const delta = Math.min((time - previousTime) / 1000, 0.05);
            previousTime = time;

            if (!motionPreference.matches) {
                spin += delta * 0.011;

                // Independent, very slow axes create an organic precession instead
                // of the rigid turntable motion of a single-axis spin.
                sphere.rotation.y = spin + Math.sin(elapsed * 0.06) * 0.09;
                tiltGroup.rotation.x = -0.08 + Math.sin(elapsed * 0.074) * 0.19;
                tiltGroup.rotation.y = Math.sin(elapsed * 0.054) * 0.12;
                tiltGroup.rotation.z = Math.sin(elapsed * 0.043 + 0.8) * 0.1;
            }

            renderer.render(scene, camera);
            animationFrame = requestAnimationFrame(draw);
        };

        const restartTiming = () => {
            previousTime = performance.now();
        };

        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", restartTiming);
        animationFrame = requestAnimationFrame(draw);

        onCleanup(() => {
            cancelAnimationFrame(animationFrame);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", restartTiming);
            geometry.dispose();
            material.dispose();
            texture.dispose();
            renderer.dispose();
        });
    });

    return (
        <canvas
            ref={canvas}
            class="spinning-sphere-background"
            aria-hidden="true"
        />
    );
}
