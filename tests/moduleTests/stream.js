import * as QUnit from 'qunit';
import music21 from '../../src/loadModules';

export default function tests() {
    QUnit.test('music21.stream.Stream', assert => {
        const s = new music21.stream.Stream();
        s.append(new music21.note.Note('C#5'));
        s.append(new music21.note.Note('D#5'));
        const n = new music21.note.Note('F5');
        n.duration.type = 'half';
        s.append(n);
        assert.equal(s.length, 3, 'Simple stream length');
        
        // test iteration.
        for (const n of s) {
            const oct = n.pitch.octave;
            assert.equal(oct, 5, 'all notes are octave 5');
        }
    });

    QUnit.test('music21.stream.Stream.duration', assert => {
        const s = new music21.stream.Stream();
        assert.equal(s.duration.quarterLength, 0, 'EmptyString QuarterLength');

        s.append(new music21.note.Note('C#5'));
        assert.equal(s.duration.quarterLength, 1.0, '1 quarter QuarterLength');

        const n = new music21.note.Note('F5');
        n.duration.type = 'half';
        s.append(n);
        assert.equal(s.highestTime, 3.0);
        assert.equal(s.duration.quarterLength, 3.0, '3 quarter QuarterLength');

        s.duration = new music21.duration.Duration(3.0);
        s.append(new music21.note.Note('D#5'));
        assert.equal(
            s.duration.quarterLength,
            3.0,
            'overridden duration -- remains'
        );

        const sc = new music21.stream.Score();
        const p1 = new music21.stream.Part();
        const p2 = new music21.stream.Part();
        const m1 = new music21.stream.Measure();
        const m2 = new music21.stream.Measure();
        const n11 = new music21.note.Note();
        const n12 = new music21.note.Note();
        n12.duration.type = 'half';
        const n13 = new music21.note.Note();
        n13.duration.type = 'eighth'; // incomplete measure
        m1.append(n11);
        m1.append(n12);
        m1.append(n13);
        const n21 = new music21.note.Note();
        n21.duration.type = 'whole';
        m2.append(n21);
        p1.append(m1);
        p2.append(m2);
        sc.insert(0, p1);
        sc.insert(0, p2);
        assert.equal(
            sc.duration.quarterLength,
            4.0,
            'duration of streams with nested parts'
        );
        assert.equal(
            sc.flat.duration.quarterLength,
            4.0,
            'duration of flat stream with overlapping notes'
        );
        n21.duration.type = 'half';
        assert.equal(
            sc.duration.quarterLength,
            3.5,
            'new music21.duration with nested parts'
        );
        assert.equal(
            sc.flat.duration.quarterLength,
            3.5,
            'new music21.duration of flat stream'
        );
    });

    QUnit.test('music21.stream.Stream.append', assert => {
        const s = new music21.stream.Stream();
        s.append(new music21.note.Note('C4'));
        assert.equal(s.length, 1);

        const s2 = new music21.stream.Stream();
        const n1 = new music21.note.Note('C#4');
        const n2 = new music21.note.Note('D4');
        const n3 = new music21.note.Note('D#4');
        n3.duration.type = 'half';
        const l = [n1, n2, n3];
        s2.append(l);
        assert.equal(s2.length, 3);
        assert.equal(s2.duration.quarterLength, 4.0);
    });
    
    QUnit.test('music21.stream.Stream.insert and offsets', assert => {
        const s = new music21.stream.Stream();
        s.append(new music21.note.Note('C#5'));
        const n3 = new music21.note.Note('E5');
        s.insert(2.0, n3);
        let n2 = new music21.note.Note('D#5');
        s.insert(1.0, n2);
        assert.equal(s.get(0).name, 'C#');
        assert.equal(s.get(1).name, 'D#');
        assert.equal(s.get(2).name, 'E');
        assert.equal(s.get(0).offset, 0.0);
        assert.equal(s.get(1).offset, 1.0);
        assert.equal(s.get(2).offset, 2.0);
        const p = new music21.stream.Part();
        const m1 = new music21.stream.Measure();
        const n1 = new music21.note.Note('C#');
        n1.duration.type = 'whole';
        m1.append(n1);
        const m2 = new music21.stream.Measure();
        n2 = new music21.note.Note('D#'); 
        n2.duration.type = 'whole'; 
        m2.append(n2);
        p.append(m1);
        p.append(m2);
        assert.equal(p.get(0).get(0).offset, 0.0);
        const pf = p.flat;
        assert.equal(pf.get(1).offset, 4.0);
        const pf2 = p.flat; // repeated calls do not change
        assert.equal(
            pf2.get(1).offset,
            4.0,
            'repeated calls do not change offset'
        );
        const pf3 = pf2.flat;
        assert.equal(
            pf3.get(1).offset,
            4.0,
            '.flat.flat does not change offset'
        );
    });

    QUnit.test('music21.stream.Stream insertAndShift', assert => {
        const s = new music21.stream.Stream();
        s.insert(0, new music21.note.Note('C4'));
        s.insert(1, new music21.note.Note('E4'));
        s.insert(2, new music21.note.Note('F4'));
        s.insertAndShift(1, new music21.note.Note('D4'));
        const outListNames = [];
        const outListOffsets = [];
        for (const n of s) {
            outListNames.push(n.name);
            outListOffsets.push(n.offset);
        }
        assert.equal(outListNames[0], 'C');
        assert.equal(outListOffsets[0], 0.0);
        assert.equal(outListNames[1], 'D');
        assert.equal(outListOffsets[1], 1.0);
        assert.equal(outListNames[2], 'E');
        assert.equal(outListOffsets[2], 2.0);
        assert.equal(outListNames[3], 'F');
        assert.equal(outListOffsets[3], 3.0);
    });

    QUnit.test('music21.stream.Stream.DOM', assert => {
        const s = new music21.stream.Stream();
        s.append(new music21.note.Note('C#5'));
        s.append(new music21.note.Note('D#5'));
        const n = new music21.note.Note('F5');
        n.duration.type = 'half';
        s.append(n);
        const c = s.createNewDOM(100, 50);
        assert.equal(c.attr('width'), 100, 'stored width matches');
        assert.equal(c.attr('height'), 50, 'stored height matches');
    });

    QUnit.test('music21.stream.Stream.getElementsByClass', assert => {
        const s = new music21.stream.Stream();
        const n1 = new music21.note.Note('C#5');
        const n2 = new music21.note.Note('D#5');
        const r = new music21.note.Rest();
        const tc = new music21.clef.TrebleClef();
        s.append(tc);
        s.append(n1);
        s.append(r);
        s.append(n2);
        let c = s.getElementsByClass('Note');
        assert.equal(c.length, 2, 'got two notes');
        assert.equal(c.get(0), n1, 'n1 first');
        assert.equal(c.get(1), n2, 'n2 second');
        c = s.getElementsByClass('Clef');
        assert.equal(c.length, 1, 'got clef from subclass');
        c = s.getElementsByClass(['Note', 'TrebleClef']);
        assert.equal(c.length, 3, 'got multiple classes');
        c = s.getElementsByClass('GeneralNote');
        assert.equal(c.length, 3, 'got multiple subclasses');
    });
    QUnit.test('music21.stream.offsetMap', assert => {
        const n = new music21.note.Note('G3');
        const o = new music21.note.Note('A3');
        const s = new music21.stream.Measure();
        s.insert(0, n);
        s.insert(0.5, o);
        const om = s.offsetMap();
        assert.equal(om.length, 2, 'offsetMap should have length 2');
        const omn = om[0];
        const omo = om[1];
        assert.equal(omn.element, n, 'omn element should be n');
        assert.equal(omn.offset, 0.0, 'omn offset should be 0');
        assert.equal(omn.endTime, 1.0, 'omn endTime should be 1.0');
        assert.equal(
            omn.voiceIndex,
            undefined,
            'omn voiceIndex should be undefined'
        );
        assert.equal(omo.element, o, 'omo element should be o');
        assert.equal(omo.offset, 0.5, 'omo offset should be 0.5');
        assert.equal(omo.endTime, 1.5, 'omo endTime should be 1.5');
    });
    QUnit.test('music21.stream.Stream appendNewDOM ', assert => {
        const n = new music21.note.Note('G3');
        const s = new music21.stream.Measure();
        s.append(n);
        s.appendNewDOM(document.body);
        assert.equal(s.length, 1, 'ensure that should have one note');
        const n1 = new music21.note.Note('G3');
        const s1 = new music21.stream.Measure();
        s1.append(n1);
        const n2 = new music21.note.Note('G3');
        s1.append(n2);
        const n3 = new music21.note.Note('G3');
        s1.append(n3);
        const n4 = new music21.note.Note('G3');
        s1.append(n4);
        const div1 = s1.editableAccidentalDOM();
        $(document.body).append(div1);
    });
    QUnit.test('music21.stream.Stream makeAccidentals ', assert => {
        const n = new music21.note.Note('G#3');
        const n2 = new music21.note.Note('G#3');
        const n3 = new music21.note.Note('C#4');
        const c = new music21.chord.Chord(['C3', 'E-3', 'G3', 'G4']);
        const ks = new music21.key.KeySignature(2);
        const s = new music21.stream.Measure();        
        s.keySignature = ks;
        s.append([n, n2, n3, c]);
        s.makeAccidentals();
        assert.ok(n.pitch.accidental.displayStatus);
        assert.notOk(n2.pitch.accidental.displayStatus);
        assert.notOk(n3.pitch.accidental.displayStatus);
        assert.ok(c._notes[0].pitch.accidental);
        assert.ok(c._notes[0].pitch.accidental.displayStatus);
        assert.ok(c._notes[1].pitch.accidental.displayStatus);
        assert.ok(c._notes[2].pitch.accidental.displayStatus);
        assert.notOk(c._notes[3].pitch.accidental); // perhaps should exist?
    });
}
