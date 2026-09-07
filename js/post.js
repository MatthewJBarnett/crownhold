'use strict';

// ===========================================================================
// Post-processing without EffectComposer: scene -> bright pass -> blur -> composite (bloom + grading)
// ===========================================================================
class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const gl2 = renderer.capabilities.isWebGL2 && !/[?&]msaa=0/.test(location.search);   // msaa=0: plain target (software renderers crawl on multisampled targets)
    // stencilBuffer: true makes three.js allocate a 24-bit depth buffer (DEPTH24_STENCIL8). The default, depth-only
    // target is only 16-bit, which z-fights the water plane through the terrain when zoomed out.
    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true };
    this.rtScene = gl2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(4, 4, opts) : new THREE.WebGLRenderTarget(4, 4, opts);
    if (this.rtScene.samples !== undefined) this.rtScene.samples = 4;
    const q = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, q); this.rtB = new THREE.WebGLRenderTarget(4, 4, q);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.bright = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, th: { value: 0.93 } }, vertexShader: vs, fragmentShader: `
      uniform sampler2D t; uniform float th; varying vec2 vUv;
      void main(){ vec4 c = texture2D(t, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c.rgb * smoothstep(th, th + 0.3, l), 1.0); }`, depthTest: false, depthWrite: false });
    this.blur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, dir: { value: new THREE.Vector2(1, 0) } }, vertexShader: vs, fragmentShader: `
      uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){
        vec4 s = texture2D(t, vUv) * 0.227;
        s += (texture2D(t, vUv + dir * 1.385) + texture2D(t, vUv - dir * 1.385)) * 0.316;
        s += (texture2D(t, vUv + dir * 3.231) + texture2D(t, vUv - dir * 3.231)) * 0.070;
        gl_FragColor = s; }`, depthTest: false, depthWrite: false });
    this.comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, b: { value: null }, strength: { value: 0.22 } }, vertexShader: vs, fragmentShader: `
      uniform sampler2D t; uniform sampler2D b; uniform float strength; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(t, vUv).rgb + texture2D(b, vUv).rgb * strength;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, 1.06);                 // a little more colour
        c = (c - 0.5) * 1.03 + 0.5;                // a little more contrast
        c *= vec3(1.01, 1.0, 0.985);               // a faint warm cast
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`, depthTest: false, depthWrite: false });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.w = 0; this.h = 0;
  }
  setSize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rtScene.setSize(w, h);
    const qw = Math.max(1, Math.floor(w / 4)), qh = Math.max(1, Math.floor(h / 4));
    this.rtA.setSize(qw, qh); this.rtB.setSize(qw, qh);
    this.texel = new THREE.Vector2(1 / qw, 1 / qh);
  }
  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }
  render(scene, camera) {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    this.bright.uniforms.t.value = this.rtScene.texture; this.pass(this.bright, this.rtA);
    this.blur.uniforms.t.value = this.rtA.texture; this.blur.uniforms.dir.value.set(this.texel.x, 0); this.pass(this.blur, this.rtB);
    this.blur.uniforms.t.value = this.rtB.texture; this.blur.uniforms.dir.value.set(0, this.texel.y); this.pass(this.blur, this.rtA);
    this.comp.uniforms.t.value = this.rtScene.texture; this.comp.uniforms.b.value = this.rtA.texture; this.pass(this.comp, null);
    r.setRenderTarget(null);
  }
}
