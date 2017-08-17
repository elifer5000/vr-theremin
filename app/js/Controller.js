import MainView from './view/MainView';
import AudioController from './AudioController';
import {hslToRgb, lerp} from './util';

export default class Controller {
    constructor(renderingContextFactory) {
        this.keyboardWidth = 1.0;
        this.keyWidth = 0.0075;
        this.keySharpWidth = 0.005;
        this.keyHeight = 0.01;
        this.keyLength = 0.2;

        this.soundNameMeshes = [ null, null ];
        this.audio = [];
        this.audio.push(new AudioController(this.keyboardWidth));
        this.audio.push(new AudioController(this.keyboardWidth));
        this.view = new MainView(this, renderingContextFactory);
        this.view.initialize();
        this.initialize();
    }

    initialize() {
        this.room = new THREE.Mesh(
            new THREE.BoxBufferGeometry( 6, 6, 6, 8, 8, 8 ), this.createRoomMaterial()
        );
        this.room.position.y = 3;

        this.room.receiveShadow = true;
        this.view.scene.add( this.room );

        this.highlightColor = new THREE.Color(0xFFFF00);

        for (let index = 0; index < this.view.renderingContext.controllers.length; index++) {
            const controller = this.view.renderingContext.controllers[index];
            controller.addEventListener('triggerdown', () => { this.onTriggerDown(index); });
            controller.addEventListener('menudown', () => { this.onMenuDown(index); });
        }
        const loader = new THREE.FontLoader();
        this.waveGeometry = [];
        loader.load('resources/helvetiker_regular.typeface.json', ( font ) => {
            this.font = font;
            console.log('font loaded');
            this.addKeysToScene();
            this.createWaveVisualization(0);
            this.createWaveVisualization(1);
        });

    }

    createRoomMaterial() {
        //this.createAudioTexture();

        this.texturedMaterial = new THREE.MeshStandardMaterial( { emissive: 0xfffdfb, emissiveIntensity: 0.15, side: THREE.BackSide } )
        const floorMaterial = new THREE.MeshStandardMaterial( { color: 0xA0A0A0, side: THREE.BackSide } );

        const materials = [];
        for (let i = 0; i < 6; i++) {
            if (i === 3) {
                materials.push(floorMaterial);
            } else {
                materials.push(this.texturedMaterial);
            }
        }

        return new THREE.MeshFaceMaterial(materials);
    }

    createKeyGeometry(isSharp) {
        return new THREE.BoxGeometry(isSharp ? this.keySharpWidth : this.keyWidth, this.keyHeight, this.keyLength);
    }

    addKeysToScene() {
        this.notes = this.audio[0].getNotesWithPosition();
        this.rootObject = new THREE.Object3D();
        const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(1.05*this.keyboardWidth, 1.05*this.keyHeight, 1.2*this.keyLength),
                                        new THREE.MeshStandardMaterial( { color: 0x838380 }));

        baseMesh.position.y -= 1.05*this.keyHeight / 2;
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        this.rootObject.add(baseMesh);
        // console.log(this.notes);
        for (const n in this.notes) {
            const isSharp = n.includes('#');
            const pos = this.notes[n].position;
            const color = isSharp ? 0x353535 : 0xfffff0;
            const noteMesh = new THREE.Mesh(
                this.createKeyGeometry(isSharp),
                new THREE.MeshStandardMaterial( { color: color, wireframe: false } )
            );
            noteMesh.position.copy(pos);
            //noteMesh.rotation.y = this.audio[0].orientation;
            this.rootObject.add( noteMesh );
            this.notes[n].mesh = noteMesh;
            this.notes[n].isSharp = isSharp;
            this.notes[n].origColor = new THREE.Color(color);

            if (!isSharp) {
                const fontGeometry = new THREE.TextGeometry(n[0], {size: 0.015, height: 0.005, font: this.font});
                const fontMesh = new THREE.Mesh(fontGeometry, new THREE.MeshStandardMaterial({color: 0x3661a5}));
                fontMesh.position.copy(pos);
                fontMesh.position.z -= this.keyLength / 2;
                fontMesh.position.x -= 0.006;
                fontMesh.position.y += this.keyHeight;

                fontMesh.rotation.x -= Math.PI / 6;
                this.rootObject.add(fontMesh);
            }
        }
        this.updateSoundName(0);
        this.updateSoundName(1);
        this.rootObject.position.set(0.4, 0.5, -2);
        // this.rootObject.rotation.set(0, 0, 0);

        this.view.renderingContext.addSpotlight(this.rootObject);
        this.view.scene.add(this.rootObject);
    }

    moveKeys(pos, orientation) {
        const downVec = new THREE.Vector3(0, -0.05, 0);
        downVec.applyEuler(orientation);
        this.rootObject.position.copy(pos);
        this.rootObject.position.add(downVec);
        this.rootObject.rotation.copy(orientation);
    }

    resetHighlights() {
        for (const n in this.notes) {
            const note = this.notes[n];
            note.mesh.material.color = note.origColor;
        }
    }

    createWaveVisualization(index) {
        const geo = new THREE.Geometry();
        const width =  0.5;
        const bufferLength = 1024;
        const offset = (index === 0) ? -this.keyboardWidth/3 : this.keyboardWidth/4.5;
        for (let i = 0; i < bufferLength; i++) {
            const vertex = new THREE.Vector3(offset + -width/2 + i*width/(bufferLength-1), 0.3, -this.keyLength / 2);
            geo.vertices.push(vertex);
        }
        const points = new THREE.Line(geo);

        this.rootObject.add(points);
        this.waveGeometry.push(points);
    }

    updateWaveVisualization(index) {
        if (!this.waveGeometry || index >= this.waveGeometry.length) {
            return;
        }
        const waveform = this.audio[index].getWaveFormData();
        let maxv = 0;
        const halfHeight = 0.2;
        // console.log(waveform.data.length);
        for (let i = 0; i < waveform.length; i++) {
            this.waveGeometry[index].geometry.vertices[i].y = 0.3 + halfHeight*waveform[i];
            maxv = Math.max(maxv, waveform[i]);
        }
        // console.log(maxv);
        this.waveGeometry[index].geometry.verticesNeedUpdate = true;
    }

    createAudioTexture() {
        const size = 64;
        const rgba = new Uint8Array(size * size * 4);
        for (var i = 0; i < size * size; i++) {
            // RGB from 0 to 255
            rgba[4 * i] = 0;
            rgba[4 * i + 1] = 0;
            rgba[4 * i + 2] = 0;
            // OPACITY
            rgba[4 * i + 3] = 255;
        }

        this.audioDataTex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
        this.audioDataTex.needsUpdate = true;
        this.currentAudioIntensity = 0;
    }


    mapFrequenciesToColor(audio) {
        const freqs = audio.getFrequencyData();
        const stepSize = audio.getFrequencyStep();

        const MAX_FREQ = 2500; //44100/2;
        // 100 hz to 2100 hz
        let freq = 0;
        let colors = [];
        for (let i = 0; i < freqs.length; i++) {
            freq = i*stepSize;
            const amp = freqs[i];
            if (amp > 32) {
                console.log(freq);
                const color = hslToRgb(0.65 + freq/MAX_FREQ*0.35, 0.7 + Math.random()*0.3, 0.5);
                colors.push(color);
            }
        }

        return colors;
    }

    updateAudioTexture() {
        if (!this.audioDataTex) return;

        const colors1 = this.mapFrequenciesToColor(this.audio[0]);
        const colors2 = this.mapFrequenciesToColor(this.audio[1]);
        const colors = colors1.concat(colors2);

        const size = 64;
        const rgba = this.audioDataTex.image.data;
        for (let i = 0; i < size * size; i++) {
            let color = [0, 0, 0];

            if (colors.length > 0) {
                const randIndex = Math.floor((colors.length - 1) * Math.random());
                color = colors[randIndex];
            }
            // RGB from 0 to 255
            rgba[4 * i] = lerp(rgba[4 * i], color[0], 0.05);
            rgba[4 * i + 1] = lerp(rgba[4 * i + 1], color[1], 0.05);
            rgba[4 * i + 2] = lerp(rgba[4 * i + 2], color[2], 0.05);
            // OPACITY
            // rgba[4 * i + 3] = 255;
        }
        // Get average volume

        const volume = Math.max(this.audio[0].getVolume(), this.audio[1].getVolume());
        this.currentAudioIntensity = lerp(this.currentAudioIntensity, volume, 0.05); //this.currentAudioIntensity + 0.05*(volume - this.currentAudioIntensity);
        this.view.renderingContext.hemiLight.intensity = Math.max(0.15, 3*this.currentAudioIntensity);
        this.audioDataTex.needsUpdate = true;
    }

    changeAudioFromController(vrController, audio) {
        if (!this.rootObject) {
            return;
        }

        const pos = vrController.realPosition;
           
        let gain = 0.99;
        const gamepad = vrController.getGamepad();
        if (gamepad) {
            gain = 0;
            let detuneCents = 0;
            if (gamepad.buttons[0].touched) {
                // gain = Math.log10(1 + 9 * (gamepad.axes[1] + 1) / 2);
                // Let's try the opposite of log, x^4
                const gainNormalized = (Math.max(-0.5, gamepad.axes[1]) + 0.5) / 1.5;
                gain = gainNormalized * gainNormalized * gainNormalized;
                // console.log(gain);
                // detuneCents = 100*gamepad.axes[0];
            }
            audio.detune(detuneCents);
        }

        const posLocal = pos.clone();
        this.rootObject.worldToLocal(posLocal);
        // check is inside space if not, gain 0
        if (Math.abs(posLocal.z) > this.keyLength/2 || Math.abs(posLocal.y) > 0.3 || Math.abs(posLocal.x) > this.keyboardWidth/2) {
            audio.onChange(0, 0);
            return;
        }

        
        let currentNote = null;
        for (const n in this.notes) {
            const note = this.notes[n];

            if (Math.abs(posLocal.x - note.position.x) < 0.0065) {
                note.mesh.material.color = this.highlightColor;

                if (gamepad && vrController.lastNote !== note) {
                    if (gamepad.haptics) { // Old version. Deprecated
                        gamepad.haptics[0].vibrate(0.25, 25);
                    } else if (gamepad.hapticActuators) {
                        gamepad.hapticActuators[0].pulse(0.25, 25);
                    }
                }
                currentNote = note;
                break;
            }
        }
        if (currentNote) {
            audio.onChange(currentNote.position.x, gain);   
        }
        else {
            audio.onChange(posLocal.x, gain);    
        }            

        vrController.lastNote = currentNote;
    }

    updateSoundName(index) {
        if (!this.font) return;

        if (this.soundNameMeshes[index]) {
            this.rootObject.remove(this.soundNameMeshes[index]);
        }

        const fontSoundGeometry = new THREE.TextGeometry(this.audio[index].getSoundName(), {size: 0.03, height: 0.005, font: this.font});
        const fontDelayGeometry = new THREE.TextGeometry(this.audio[index].isDelayEnabled ? 'delay on' : '', {size: 0.02, height: 0.005, font: this.font});

        this.soundNameMeshes[index] = new THREE.Mesh(fontSoundGeometry, new THREE.MeshStandardMaterial({color: 0xb642f4}));
        this.soundNameMeshes[index].position.z = -this.keyLength / 2;
        this.soundNameMeshes[index].position.x = (index === 0) ? -this.keyboardWidth/3 : this.keyboardWidth/4.5;
        this.soundNameMeshes[index].position.y = 7*this.keyHeight;
        this.soundNameMeshes[index].rotation.x -= Math.PI / 6;

        const delayMesh = new THREE.Mesh(fontDelayGeometry, new THREE.MeshStandardMaterial({color: 0xb642f4}));
        delayMesh.position.y = -2.5*this.keyHeight;
        this.soundNameMeshes[index].add(delayMesh);


        this.rootObject.add(this.soundNameMeshes[index] );
    }


    onTriggerDown(index) {
        this.audio[index].selectNextSound();
        this.updateSoundName(index);
    }

    onMenuDown(index) {
        this.audio[index].toggleDelay();
        this.updateSoundName(index);
    }

    onControllerMoved(controllers, head) {
        this.resetHighlights();
        for (let i = 0; i < controllers.length; i++) {
            if (controllers[i].getButtonState('grips')) {
                this.moveKeys(controllers[i].realPosition, controllers[i].realRotation);
            }

            this.changeAudioFromController(controllers[i], this.audio[i]);
            this.updateWaveVisualization(i);
        }
        // this.updateAudioTexture();
    }
}