import * as QUnit from 'qunit';
import music21 from '../../src/loadModules'; 

export default function tests() {
    QUnit.test('music21.key.Key', (assert) => {
        const testSharps = [
                            // sharps, mode, given name, given mode
                            [0, 'minor', 'a'],
                            [0, 'major', 'C'],
                            [0, 'major'],
                            [6, 'major', 'F#'],
                            [3, 'minor', 'f#'],
                            [6, 'major', 'f#', 'major'],
                            [-2, 'major', 'B-'],
                            [-5, 'minor', 'b-'],
        ];
        for (let i = 0; i < testSharps.length; i++) {
            const thisTest = testSharps[i];
            const expectedSharps = thisTest[0];
            const expectedMode = thisTest[1];
            const givenKeyName = thisTest[2];
            const givenMode = thisTest[3];
            const k = new music21.key.Key(givenKeyName, givenMode);
            const foundSharps = k.sharps;
            const foundMode = k.mode;
            assert.equal(foundSharps,
                    expectedSharps,
                    'Test sharps: ' + givenKeyName + ' (mode: ' + givenMode + ') ');
            assert.equal(foundMode,
                    expectedMode,
                    'Test mode: ' + givenKeyName + ' (mode: ' + givenMode + ') ');
        }

        const k = new music21.key.Key('f#');
        let s = k.getScale();
        assert.equal(s[2].nameWithOctave, 'A4', 'test minor scale');
        assert.equal(s[6].nameWithOctave, 'E5');
        s = k.getScale('major');
        assert.equal(s[2].nameWithOctave, 'A#4', 'test major scale');
        assert.equal(s[6].nameWithOctave, 'E#5');
        s = k.getScale('harmonic minor');
        assert.equal(s[2].nameWithOctave, 'A4', 'test harmonic minor scale');
        assert.equal(s[5].nameWithOctave, 'D5');
        assert.equal(s[6].nameWithOctave, 'E#5');

        assert.equal(k.width, 15, 'checking width is 5 * abs(sharps)');
    });
}