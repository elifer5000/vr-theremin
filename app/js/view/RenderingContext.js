import Observable from '../Observable';

export default class RenderingContext extends Observable {
    constructor(container) {
        super();
        this.initialize(container);
    }

    initialize(container) {
        const width  = window.innerWidth, height = window.innerHeight;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);

        this.renderer = new THREE.WebGLRenderer( { antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x050505, 1);
        this.renderer.shadowMap.enabled = true;

        // const light2 = new THREE.SpotLight( 0xffffff );
        // light2.position.set( -10, 10, -20 );
        // light2.target.position.set(0, 0, 0);
        // this.scene.add( light2 );

        this.hemiLight = new THREE.HemisphereLight( 0xffffff, 0x005570, 0.15 );
        this.scene.add(this.hemiLight);
    }

    addSpotlight(rootObj) {
        this.spotLight = new THREE.SpotLight( 0xffffff );
        this.spotLight.position.set( 0, 1.0, 0 );
        this.spotLight.target.position.set(0, 0, 0);

        this.spotLight.castShadow = true;

        this.spotLight.distance = 4;

        this.spotLight.angle = Math.PI / 4;

        this.spotLight.penumbra = 0.1;

        if (rootObj) {
            rootObj.add(this.spotLight);
            rootObj.add(this.spotLight.target);
        } else {
            this.scene.add(this.spotLight);
        }
    }

    getHeadsetPosition() {
        return this.camera.position;
    }

    getHeadsetRotation() {
        return this.camera.rotation;
    }

    getDomElement() {
        return this.renderer.domElement;
    }
}