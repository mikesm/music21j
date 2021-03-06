/**
 * music21j -- Javascript reimplementation of Core music21p features.
 * music21/stream -- Streams -- objects that hold other Music21Objects
 *
 * Does not implement the full features of music21p Streams by a long shot...
 *
 * Copyright (c) 2013-17, Michael Scott Cuthbert and cuthbertLab
 * Based on music21 (=music21p), Copyright (c) 2006-17, Michael Scott Cuthbert and cuthbertLab
 *
 */
import * as $ from 'jquery';
import * as MIDI from 'MIDI';

import { Music21Exception } from './exceptions21.js';

import { base } from './base.js';
import { beam } from './beam.js';
import { clef } from './clef.js';
import { common } from './common.js';
import { debug } from './debug.js';
import { duration } from './duration.js';
import { instrument } from './instrument.js';
import { meter } from './meter.js';
import { pitch } from './pitch.js';
import { renderOptions } from './renderOptions.js';
import { vfShow } from './vfShow.js';

/**
 * powerful stream module, See {@link music21.stream} namespace
 * @exports music21/stream
 */
/**
 * Streams are powerful music21 objects that hold Music21Object collections,
 * such as {@link music21.note.Note} or {@link music21.chord.Chord} objects.
 *
 * Understanding the {@link music21.stream.Stream} object is of fundamental
 * importance for using music21.  Definitely read the music21(python) tutorial
 * on using Streams before proceeding
 *
 * @namespace music21.stream
 * @memberof music21
 * @requires music21/base
 * @requires music21/renderOptions
 * @requires music21/clef
 * @requires music21/vfShow
 * @requires music21/duration
 * @requires music21/common
 * @requires music21/meter
 * @requires music21/pitch
 * @requires jquery
 */
export const stream = {};

class StreamException extends Music21Exception {}

stream.StreamException = StreamException;

/**
 * A generic Stream class -- a holder for other music21 objects
 * Will be subclassed into {@link music21.stream.Score},
 * {@link music21.stream.Part},
 * {@link music21.stream.Measure},
 * {@link music21.stream.Voice}, but most functions will be found here.
 *
 * @class Stream
 * @memberof music21.stream
 * @extends music21.base.Music21Object
 *
 * @property {Array<music21.base.Music21Object>} elements - the elements in the stream. DO NOT MODIFY individual components (consider it like a Python tuple)
 * @property {Int} length - (readonly) the number of elements in the stream.
 * @property {music21.duration.Duration} duration - the total duration of the stream's elements
 * @property {number} highestTime -- the highest time point in the stream's elements
 * @property {music21.clef.Clef} clef - the clef for the Stream (if there is one; if there are multiple, then the first clef)
 * @property {music21.meter.TimeSignature} timeSignature - the first TimeSignature of the Stream
 * @property {music21.key.KeySignature} keySignature - the first KeySignature for the Stream
 * @property {music21.renderOptions.RenderOptions} renderOptions - an object specifying how to render the stream
 * @property {music21.stream.Stream} flat - (readonly) a flattened representation of the Stream
 * @property {music21.stream.Stream} notes - (readonly) the stream with only {@link music21.note.Note} and {@link music21.chord.Chord} objects included
 * @property {music21.stream.Stream} notesAndRests - (readonly) like notes but also with {@link music21.note.Rest} objects included
 * @property {music21.stream.Stream} parts - (readonly) a filter on the Stream to just get the parts (NON-recursive)
 * @property {music21.stream.Stream} measures - (readonly) a filter on the Stream to just get the measures (NON-recursive)
 * @property {number} tempo - tempo in beats per minute (will become more sophisticated later, but for now the whole stream has one tempo
 * @property {music21.instrument.Instrument|undefined} instrument - an instrument object associated with the stream (can be set with a string also, but will return an `Instrument` object)
 * @property {Boolean} autoBeam - whether the notes should be beamed automatically or not (will be moved to `renderOptions` soon)
 * @property {Int} [staffLines=5] - number of staff lines
 * @property {function|undefined} changedCallbackFunction - function to call when the Stream changes through a standard interface
 * @property {number} maxSystemWidth - confusing... should be in renderOptions
 */
export class Stream extends base.Music21Object {
    constructor() {
        super();
        // class variables;
        this.isStream = true;
        this.isMeasure = false;
        this.classSortOrder = -20;
        this.recursionType = 'elementsFirst';

        this._duration = undefined;

        this._elements = [];
        this._elementOffsets = [];
        this._clef = undefined;
        this.displayClef = undefined;

        this._keySignature = undefined; // a music21.key.KeySignature object
        this._timeSignature = undefined; // a music21.meter.TimeSignature object
        this._instrument = undefined;

        this._autoBeam = undefined;
        this.activeVFStave = undefined;
        this.activeVFRenderer = undefined;
        this.renderOptions = new renderOptions.RenderOptions();
        this._tempo = undefined;

        this.staffLines = 5;

        this._stopPlaying = false;
        this._allowMultipleSimultaneousPlays = true; // not implemented yet.
        this.changedCallbackFunction = undefined; // for editable svges
        /**
         * A function bound to the current stream that
         * will changes the stream. Used in editableAccidentalDOM, among other places.
         *
         *      var can = s.appendNewDOM();
         *      $(can).on('click', s.DOMChangerFunction);
         *
         * @memberof music21.stream.Stream
         * @param {Event} e
         * @returns {music21.base.Music21Object|undefined} - returns whatever changedCallbackFunction does.
         */
        this.DOMChangerFunction = e => {
            const canvasOrSVGElement = e.currentTarget;
            const [clickedDiatonicNoteNum, foundNote] = this.findNoteForClick(
                canvasOrSVGElement,
                e
            );
            if (foundNote === undefined) {
                if (debug) {
                    console.log('No note found');
                }
                return undefined;
            }
            return this.noteChanged(
                clickedDiatonicNoteNum,
                foundNote,
                canvasOrSVGElement
            );
        };
    }
    * [Symbol.iterator]() {
        for (let i = 0; i < this.length; i++) {
            yield this.get(i);
        }
    }

    get duration() {
        if (this._duration !== undefined) {
            return this._duration;
        }
        return new duration.Duration(this.highestTime);
    }
    set duration(newDuration) {
        this._duration = newDuration;
    }
    get highestTime() {
        let highestTime = 0.0;
        for (const el of this) {
            let endTime = el.offset;
            if (el.duration !== undefined) {
                endTime += el.duration.quarterLength;
            }
            if (endTime > highestTime) {
                highestTime = endTime;
            }
        }
        return highestTime;
    }

    get semiFlat() {
        return this._getFlatOrSemiFlat(true);
    }

    get flat() {
        return this._getFlatOrSemiFlat(false);
    }

    _getFlatOrSemiFlat(retainContainers) {
        if (!this.hasSubStreams()) {
            return this;
        }
        const tempEls = [];
        for (const el of this) {
            if (el.isStream) {
                if (retainContainers) {
                    tempEls.push(el);
                }
                const offsetShift = el.offset;
                // console.log('offsetShift', offsetShift, el.classes[el.classes.length -1]);
                const elFlat = el._getFlatOrSemiFlat(retainContainers);
                for (let j = 0; j < elFlat.length; j++) {
                    // offset should NOT be null because already in Stream
                    elFlat.get(j).offset += offsetShift;
                }
                tempEls.push(...elFlat._elements);
            } else {
                tempEls.push(el);
            }
        }
        const newSt = this.clone(false);
        newSt.elements = tempEls;
        return newSt;
    }

    get notes() {
        return this.getElementsByClass(['Note', 'Chord']);
    }
    get notesAndRests() {
        return this.getElementsByClass('GeneralNote');
    }
    get tempo() {
        if (this._tempo === undefined && this.activeSite !== undefined) {
            return this.activeSite.tempo;
        } else if (this._tempo === undefined) {
            return 150;
        } else {
            return this._tempo;
        }
    }
    set tempo(newTempo) {
        this._tempo = newTempo;
    }
    get instrument() {
        if (this._instrument === undefined && this.activeSite !== undefined) {
            return this.activeSite.instrument;
        } else {
            return this._instrument;
        }
    }
    set instrument(newInstrument) {
        if (typeof newInstrument === 'string') {
            newInstrument = new instrument.Instrument(newInstrument);
        }
        this._instrument = newInstrument;
    }
    get clef() {
        if (this._clef === undefined && this.activeSite === undefined) {
            return new clef.Clef('treble');
        } else if (this._clef === undefined) {
            return this.activeSite.clef;
        } else {
            return this._clef;
        }
    }
    set clef(newClef) {
        this._clef = newClef;
    }
    get keySignature() {
        if (this._keySignature === undefined && this.activeSite !== undefined) {
            return this.activeSite.keySignature;
        } else {
            return this._keySignature;
        }
    }
    set keySignature(newKeySignature) {
        this._keySignature = newKeySignature;
    }
    get timeSignature() {
        if (
            this._timeSignature === undefined
            && this.activeSite !== undefined
        ) {
            return this.activeSite.timeSignature;
        } else {
            return this._timeSignature;
        }
    }
    set timeSignature(newTimeSignature) {
        if (typeof newTimeSignature === 'string') {
            newTimeSignature = new meter.TimeSignature(newTimeSignature);
        }
        this._timeSignature = newTimeSignature;
    }
    get autoBeam() {
        if (this._autoBeam === undefined && this.activeSite !== undefined) {
            return this.activeSite.autoBeam;
        } else if (this._autoBeam !== undefined) {
            return this._autoBeam;
        } else {
            return true; // default...
        }
    }
    set autoBeam(ab) {
        this._autoBeam = ab;
    }
    get maxSystemWidth() {
        let baseMaxSystemWidth = 750;
        if (
            this.renderOptions.maxSystemWidth === undefined
            && this.activeSite !== undefined
        ) {
            baseMaxSystemWidth = this.activeSite.maxSystemWidth;
        } else if (this.renderOptions.maxSystemWidth !== undefined) {
            baseMaxSystemWidth = this.renderOptions.maxSystemWidth;
        }
        return baseMaxSystemWidth / this.renderOptions.scaleFactor.x;
    }
    set maxSystemWidth(newSW) {
        this.renderOptions.maxSystemWidth
            = newSW * this.renderOptions.scaleFactor.x;
    }
    get parts() {
        return this.getElementsByClass('Part');
    }
    get measures() {
        return this.getElementsByClass('Measure');
    }
    get voices() {
        return this.getElementsByClass('Voice');
    }

    get length() {
        return this._elements.length;
    }
    get elements() {
        return this._elements;
    }
    set elements(newElements) {
        let highestOffsetSoFar = 0.0;
        this._elements = [];
        this._elementOffsets = [];
        const tempInsert = [];
        let i;
        let thisEl;
        for (i = 0; i < newElements.length; i++) {
            thisEl = newElements[i];
            const thisElOffset = thisEl.offset;
            if (thisElOffset === null || thisElOffset === highestOffsetSoFar) {
                // append
                this._elements.push(thisEl);
                thisEl.offset = highestOffsetSoFar;
                this._elementOffsets.push(highestOffsetSoFar);
                if (thisEl.duration === undefined) {
                    console.error('No duration for ', thisEl, ' in ', this);
                }
                highestOffsetSoFar += thisEl.duration.quarterLength;
            } else {
                // append -- slow
                tempInsert.push(thisEl);
            }
        }
        // console.warn('end', highestOffsetSoFar, tempInsert);
        for (i = 0; i < tempInsert.length; i++) {
            thisEl = tempInsert[i];
            this.insert(thisEl.offset, thisEl);
        }
    }

    /* override protoM21Object.clone() */
    clone(deep=true) {
        const ret = Object.create(this.constructor.prototype);
        for (const key in this) {
            if ({}.hasOwnProperty.call(this, key) === false) {
                continue;
            }
            if (key === 'activeSite') {
                ret[key] = this[key];
            } else if (key === 'renderOptions') {
                ret[key] = common.merge({}, this[key]);
            } else if (
                deep !== true
                && (key === '_elements' || key === '_elementOffsets')
            ) {
                ret[key] = this[key].slice(); // shallow copy...
            } else if (
                deep
                && (key === '_elements' || key === '_elementOffsets')
            ) {
                if (key === '_elements') {
                    // console.log('got elements for deepcopy');
                    ret._elements = [];
                    ret._elementOffsets = [];
                    for (let j = 0; j < this._elements.length; j++) {
                        ret._elementOffsets[j] = this._elementOffsets[j];
                        const el = this._elements[j];
                        // console.log('cloning el: ', el.name);
                        const elCopy = el.clone(deep);
                        elCopy.activeSite = ret;
                        ret._elements[j] = elCopy;
                    }
                }
            } else if (
                key === 'activeVexflowNote'
                || key === 'storedVexflowstave'
            ) {
                // do nothing -- do not copy vexflowNotes -- permanent recursion
            } else if (key in this._cloneCallbacks) {
                if (this._cloneCallbacks[key] === true) {
                    ret[key] = this[key];
                } else if (this._cloneCallbacks[key] === false) {
                    ret[key] = undefined;
                } else {
                    // call the cloneCallbacks function
                    this._cloneCallbacks[key](key, ret, this);
                }
            } else if (
                Object.getOwnPropertyDescriptor(this, key).get !== undefined
                || Object.getOwnPropertyDescriptor(this, key).set !== undefined
            ) {
                // do nothing
            } else if (typeof this[key] === 'function') {
                // do nothing -- events might not be copied.
            } else if (
                this[key] !== null
                && this[key] !== undefined
                && this[key].isMusic21Object === true
            ) {
                // console.log('cloning...', key);
                ret[key] = this[key].clone(deep);
            } else {
                ret[key] = this[key];
            }
        }
        return ret;
    }

    /**
     * Add an element to the end of the stream, setting its `.offset` accordingly
     *
     * @memberof music21.stream.Stream
     * @param {music21.base.Music21Object|Array} el - element or list of elements to append
     * @returns {this}
     */
    append(elOrElList) {
        if (Array.isArray(elOrElList)) {
            for (const el of elOrElList) {
                this.append(el);
            }
            return this;
        }
        
        const el = elOrElList;
        try {
            if (
                el.isClassOrSubclass !== undefined
                && el.isClassOrSubclass('NotRest')
            ) {
                // set stem direction on output...;
            }
            let elOffset = 0.0;
            if (this._elements.length > 0) {
                const lastQL = this._elements[this._elements.length - 1]
                    .duration.quarterLength;
                elOffset
                    = this._elementOffsets[this._elementOffsets.length - 1]
                    + lastQL;
            }
            this._elementOffsets.push(elOffset);
            this._elements.push(el);
            el.offset = elOffset;
            el.sites.add(this);
            el.activeSite = this; // would prefer weakref, but does not exist in JS.
        } catch (err) {
            console.error(
                'Cannot append element ',
                el,
                ' to stream ',
                this,
                ' : ',
                err
            );
        }
        return this;
    }

    /**
     * Add an element to the specified place in the stream, setting its `.offset` accordingly
     *
     * @memberof music21.stream.Stream
     * @param {number} offset - offset to place.
     * @param {music21.base.Music21Object} el - element to append
     * @returns {this}
     */
    insert(offset, el) {
        try {
            if (
                el.isClassOrSubclass !== undefined
                && el.isClassOrSubclass('NotRest')
            ) {
                // set stem direction on output
                // this.clef.setStemDirection(el);
            }
            for (let i = 0; i < this._elements.length; i++) {
                const testOffset = this._elementOffsets[i];
                if (testOffset <= offset) {
                    continue;
                } else {
                    this._elementOffsets.splice(i, 0, offset);
                    this._elements.splice(i, 0, el);
                    el.offset = offset;
                    el.activeSite = this;
                    return this;
                }
            }
            // no element found. insert at end;
            this._elementOffsets.push(offset);
            this._elements.push(el);
            el.offset = offset;
            el.sites.add(this);
            el.activeSite = this; // would prefer weakref, but does not exist in JS.
        } catch (err) {
            console.error(
                'Cannot insert element ',
                el,
                ' to stream ',
                this,
                ' : ',
                err
            );
        }
        return this;
    }

    /**
     * Inserts a single element at offset, shifting elements at or after it begins
     * later in the stream.
     *
     * In single argument form, assumes it is an element and takes the offset from the element.
     *
     * Unlike music21p, does not take a list of elements.  TODO(msc): add this.
     */
    insertAndShift(offset, elementOrNone) {
        let element;
        if (elementOrNone === undefined) {
            element = offset;
            offset = element.offset;
        } else {
            element = elementOrNone;
        }
        const amountToShift = element.duration.quarterLength;

        let shiftingOffsets = false;
        for (let i = 0; i < this.length; i++) {
            if (!shiftingOffsets && this._elementOffsets[i] >= offset) {
                shiftingOffsets = true;
            }
            if (shiftingOffsets) {
                this._elementOffsets[i] += amountToShift;
                this._elements[i].offset = this._elementOffsets[i];
            }
        }
        this.insert(offset, element);
    }

    /**
     * Remove and return the last element in the stream,
     * or return undefined if the stream is empty
     *
     * @memberof music21.stream.Stream
     * @returns {music21.base.Music21Object|undefined} last element in the stream
     */
    pop() {
        // remove last element;
        if (this.length > 0) {
            const el = this.get(-1);
            this._elementOffsets.pop();
            this._elements.pop();
            el.sites.remove(this);
            return el;
        } else {
            return undefined;
        }
    }

    /**
     * Get the `index`th element from the Stream.  Equivalent to the
     * music21p format of s[index].  Can use negative indexing to get from the end.
     *
     * @memberof music21.stream.Stream
     * @param {Int} index - can be -1, -2, to index from the end, like python
     * @returns {music21.base.Music21Object|undefined}
     */
    get(index) {
        // substitute for Python stream __getitem__; supports -1 indexing, etc.
        let el;
        if (index === undefined) {
            return undefined;
        } else if (Math.abs(index) > this._elements.length) {
            return undefined;
        } else if (index === this._elements.length) {
            return undefined;
        } else if (index < 0) {
            el = this._elements[this._elements.length + index];
            el.offset = this._elementOffsets[this._elements.length + index];
            return el;
        } else {
            el = this._elements[index];
            el.offset = this._elementOffsets[index];
            return el;
        }
    }

    setElementOffset(el, value, addElement = false) {
        for (let i = 0; i < this.length; i++) {
            if (this._elements[i] === el) {
                this._elementOffsets[i] = value;
                return;
            }
        }
        if (!addElement) {
            throw new StreamException(
                'Cannot set the offset for elemenet '
                    + el.toString()
                    + ', not in Stream'
            );
        } else {
            this.insert(value, el);
        }
    }

    elementOffset(element, stringReturns = false) {
        for (let i = 0; i < this.length; i++) {
            if (this._elements[i] === element) {
                return this._elementOffsets[i];
            }
        }
        throw new StreamException(
            'An entry for this object is not stored in this Stream.'
        );
    }

    /*  --- ############# END ELEMENT FUNCTIONS ########## --- */

    /**
     * Returns Boolean about whether this stream contains any other streams.
     *
     * @memberof music21.stream.Stream
     * @returns {Boolean}
     */
    hasSubStreams() {
        let hasSubStreams = false;
        for (const el of this) {
            if (el.isClassOrSubclass('Stream')) {
                hasSubStreams = true;
                break;
            }
        }
        return hasSubStreams;
    }
    /**
     * Takes a stream and places all of its elements into
     * measures (:class:`~music21.stream.Measure` objects)
     * based on the :class:`~music21.meter.TimeSignature` objects
     * placed within
     * the stream. If no TimeSignatures are found in the
     * stream, a default of 4/4 is used.

     * If `options.inPlace` is true, the original Stream is modified and lost
     * if `options.inPlace` is False, this returns a modified deep copy.

     * @memberof music21.stream.Stream
     * @param {object} options
     * @returns {music21.stream.Stream}
     */
    makeMeasures(options) {
        const params = {
            meterStream: undefined,
            refStreamOrTimeRange: undefined,
            searchContext: false,
            innerBarline: undefined,
            finalBarline: 'final',
            bestClef: false,
            inPlace: false,
        };
        common.merge(params, options);
        let voiceCount;
        if (this.hasVoices()) {
            voiceCount = this.getElementsByClass('Voice').length;
        } else {
            voiceCount = 0;
        }
        // meterStream
        const meterStream = this.getElementsByClass('TimeSignature');
        if (meterStream.length === 0) {
            meterStream.append(this.timeSignature);
        }
        // getContextByClass('Clef')
        const clefObj = this.clef;
        const offsetMap = this.offsetMap();
        let oMax = 0;
        for (let i = 0; i < offsetMap.length; i++) {
            if (offsetMap[i].endTime > oMax) {
                oMax = offsetMap[i].endTime;
            }
        }
        // console.log('oMax: ', oMax);
        const post = new this.constructor();
        // derivation
        let o = 0.0;
        let measureCount = 0;
        let lastTimeSignature;
        let m;
        let mStart;
        while (measureCount === 0 || o < oMax) {
            m = new stream.Measure();
            m.number = measureCount + 1;
            // var thisTimeSignature = meterStream.getElementAtOrBefore(o);
            const thisTimeSignature = this.timeSignature;
            if (thisTimeSignature === undefined) {
                break;
            }
            const oneMeasureLength
                = thisTimeSignature.barDuration.quarterLength;
            if (oneMeasureLength === 0) {
                // if for some reason we are advancing not at all, then get out!
                break;
            }
            if (measureCount === 0) {
                // simplified...
            }
            m.clef = clefObj;
            m.timeSignature = thisTimeSignature.clone();

            for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex++) {
                const v = new stream.Voice();
                v.id = voiceIndex;
                m.insert(0, v);
            }
            post.insert(o, m);
            o += oneMeasureLength;
            measureCount += 1;
        }
        for (let i = 0; i < offsetMap.length; i++) {
            const ob = offsetMap[i];
            const e = ob.element;
            const start = ob.offset;
            const voiceIndex = ob.voiceIndex;

            // if 'Spanner' in e.classes;
            lastTimeSignature = undefined;
            for (let j = 0; j < post.length; j++) {
                m = post.get(j); // nothing but measures...
                if (m.timeSignature !== undefined) {
                    lastTimeSignature = m.timeSignature;
                }
                mStart = m.getOffsetBySite(post);
                const mEnd
                    = mStart + lastTimeSignature.barDuration.quarterLength;
                if (start >= mStart && start < mEnd) {
                    break;
                }
            }
            // if not match, raise Exception;
            const oNew = start - mStart;
            if (m.clef === e) {
                continue;
            }
            if (oNew === 0 && e.isClassOrSubclass('TimeSignature')) {
                continue;
            }
            let insertStream = m;
            if (voiceIndex !== undefined) {
                insertStream = m.getElementsByClass('Voice').get(voiceIndex);
            }
            insertStream.insert(oNew, e);
        }
        // set barlines, etc.
        if (params.inPlace !== true) {
            return post;
        } else {
            this.elements = [];
            // endElements
            // elementsChanged;
            for (const e of post) {
                this.insert(e.offset, e);
            }
            return this; // javascript style;
        }
    }

    /**
     * Return a new Stream or modify this stream
     * to have beams.
     *
     * NOT yet being called March 2018
     */
    makeBeams(options) {
        const params = { inPlace: false };
        common.merge(params, options);
        let returnObj = this;
        if (!params.inPlace) {
            returnObj = this.clone(true);
        }
        let mColl;
        if (this.classes.includes('Measure')) {
            mColl = [returnObj];
        } else {
            mColl = [];
            for (const m of returnObj.getElementsByClass('Measure').elements) {
                mColl.push(m);
            }
        }
        let lastTimeSignature;
        for (const m of mColl) {
            if (m.timeSignature !== undefined) {
                lastTimeSignature = m.timeSignature;
            }
            if (lastTimeSignature === undefined) {
                throw new StreamException('Need a Time Signature to process beams');
            }
            // todo voices!
            if (m.length <= 1) {
                continue; // nothing to beam.
            }
            const noteStream = m.notesAndRests;
            const durList = [];
            for (const n of noteStream) {
                durList.push(n.duration);
            }
            const durSum = durList.map(a => a.quarterLength).reduce((total, val) => total + val);
            const barQL = lastTimeSignature.barDuration.quarterLength;
            if (durSum > barQL) {
                continue;
            }
            let offset = 0.0;
            if (m.paddingLeft !== 0.0 && m.paddingLeft !== undefined) {
                offset = m.paddingLeft;
            } else if (noteStream.highestTime < barQL) {
                offset = barQL - noteStream.highestTime;
            }
            const beamsList = lastTimeSignature.getBeams(noteStream, { measureStartOffset: offset });
            for (let i = 0; i < noteStream.length; i++) {
                const n = noteStream.get(i);
                const thisBeams = beamsList[i];
                if (thisBeams !== undefined) {
                    n.beams = thisBeams;
                } else {
                    n.beams = new beam.Beams();
                }
            }
        }

        // returnObj.streamStatus.beams = true;
        return returnObj;
    }

    /**
     * Returns true if any note in the stream has lyrics, otherwise false
     *
     * @memberof music21.stream.Stream
     * @returns {Boolean}
     */
    hasLyrics() {
        for (const el of this) {
            if (el.lyric !== undefined) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a list of OffsetMap objects
     *
     * @memberof music21.stream.Stream
     * @returns [music21.stream.OffsetMap]
     */
    offsetMap() {
        const offsetMap = [];
        let groups = [];
        if (this.hasVoices()) {
            $.each(this.getElementsByClass('Voice').elements, (i, v) => {
                groups.push([v.flat, i]);
            });
        } else {
            groups = [[this, undefined]];
        }
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i][0];
            const voiceIndex = groups[i][1];
            for (let j = 0; j < group.length; j++) {
                const e = group.get(j);
                const dur = e.duration.quarterLength;
                const offset = e.offset; // TODO: getOffsetBySite(group)
                const endTime = offset + dur;
                const thisOffsetMap = new stream.OffsetMap(
                    e,
                    offset,
                    endTime,
                    voiceIndex
                );
                offsetMap.push(thisOffsetMap);
            }
        }
        return offsetMap;
    }

    /**
     * Find all elements with a certain class; if an Array is given, then any
     * matching class will work.
     *
     * @memberof music21.stream.Stream
     * @param {Array<string>|string} classList - a list of classes to find
     * @returns {music21.stream.Stream}
     */
    getElementsByClass(classList) {
        const tempEls = [];
        for (const thisEl of this) {
            // console.warn(thisEl);
            if (thisEl.isClassOrSubclass === undefined) {
                console.error(
                    'what the hell is a ',
                    thisEl,
                    'doing in a Stream?'
                );
            } else if (thisEl.isClassOrSubclass(classList)) {
                tempEls.push(thisEl);
            }
        }
        const newSt = this.clone(false);
        newSt.elements = tempEls;
        return newSt;
    }
    /**
     * Sets Pitch.accidental.displayStatus for every element with a
     * pitch or pitches in the stream. If a natural needs to be displayed
     * and the Pitch does not have an accidental object yet, adds one.
     *
     * Called automatically before appendDOM routines are called.
     *
     * @memberof music21.stream.Stream
     * @returns {music21.stream.Stream} this
     */
    makeAccidentals() {
        // cheap version of music21p method
        const extendableStepList = {};
        const stepNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
        for (const stepName of stepNames) {
            let stepAlter = 0;
            if (this.keySignature !== undefined) {
                const tempAccidental = this.keySignature.accidentalByStep(
                    stepName
                );
                if (tempAccidental !== undefined) {
                    stepAlter = tempAccidental.alter;
                    // console.log(stepAlter + " " + stepName);
                }
            }
            extendableStepList[stepName] = stepAlter;
        }
        const lastOctaveStepList = [];
        for (let i = 0; i < 10; i++) {
            const tempOctaveStepDict = $.extend({}, extendableStepList);
            lastOctaveStepList.push(tempOctaveStepDict);
        }
        const lastOctavelessStepDict = $.extend({}, extendableStepList); // probably unnecessary, but safe...

        for (const el of this) {
            if (el.pitch !== undefined) {
                // note
                const p = el.pitch;
                const lastStepDict = lastOctaveStepList[p.octave];
                this._makeAccidentalForOnePitch(
                    p,
                    lastStepDict,
                    lastOctavelessStepDict
                );
            } else if (el._notes !== undefined) {
                // chord
                for (const chordNote of el._notes) {
                    const p = chordNote.pitch;
                    const lastStepDict = lastOctaveStepList[p.octave];
                    this._makeAccidentalForOnePitch(
                        p,
                        lastStepDict,
                        lastOctavelessStepDict
                    );
                }
            }
        }
        return this;
    }

    //  returns pitch
    _makeAccidentalForOnePitch(p, lastStepDict, lastOctavelessStepDict) {
        if (lastStepDict === undefined) {
            // octave < 0 or > 10? -- error that appeared sometimes.
            lastStepDict = {};
        }
        let newAlter;
        if (p.accidental === undefined) {
            newAlter = 0;
        } else {
            newAlter = p.accidental.alter;
        }
        // console.log(p.name + " " + lastStepDict[p.step].toString());
        if (
            lastStepDict[p.step] !== newAlter
            || lastOctavelessStepDict[p.step] !== newAlter
        ) {
            if (p.accidental === undefined) {
                p.accidental = new pitch.Accidental('natural');
            }
            p.accidental.displayStatus = true;
            // console.log("setting displayStatus to true");
        } else if (
            lastStepDict[p.step] === newAlter
            && lastOctavelessStepDict[p.step] === newAlter
        ) {
            if (p.accidental !== undefined) {
                p.accidental.displayStatus = false;
            }
            // console.log("setting displayStatus to false");
        }
        lastStepDict[p.step] = newAlter;
        lastOctavelessStepDict[p.step] = newAlter;
        return p;
    }

    /**
     * Sets the render options for any substreams (such as placing them
     * in systems, etc.) DOES NOTHING for music21.stream.Stream, but is
     * overridden in subclasses.
     *
     * @memberof music21.stream.Stream
     * @returns {music21.stream.Stream} this
     */
    setSubstreamRenderOptions() {
        /* does nothing for standard streams ... */
        return this;
    }
    /**
     * Resets all the RenderOptions back to defaults. Can run recursively
     * and can also preserve the `RenderOptions.events` object.
     *
     * @memberof music21.stream.Stream
     * @param {Boolean} [recursive=false]
     * @param {Boolean} [preserveEvents=false]
     * @returns {music21.stream.Stream} this
     */
    resetRenderOptions(recursive, preserveEvents) {
        const oldEvents = this.renderOptions.events;
        this.renderOptions = new renderOptions.RenderOptions();
        if (preserveEvents) {
            this.renderOptions.events = oldEvents;
        }

        if (recursive) {
            for (const el of this) {
                if (el.isClassOrSubclass('Stream')) {
                    el.resetRenderOptions(recursive, preserveEvents);
                }
            }
        }
        return this;
    }

    //  * *********  VexFlow functionality

    renderVexflowOnCanvas(canvasOrSVG) {
        console.warn(
            'renderVexflowOnCanvas is deprecated; call renderVexflow instead'
        );
        return this.renderVexflow(canvasOrSVG);
    }

    /**
     * Uses {@link music21.vfShow.Renderer} to render Vexflow onto an
     * existing canvas or SVG object.
     *
     * Runs `this.setRenderInteraction` on the canvas.
     *
     * Will be moved to vfShow eventually when converter objects are enabled...maybe.
     *
     * @memberof music21.stream.Stream
     * @param {DOMObject|JQueryDOMObject} canvasOrSVG - a canvas or the div surrounding an SVG object
     * @returns {vfShow.Renderer}
     */
    renderVexflow(canvasOrSVG) {
        if (canvasOrSVG.jquery) {
            canvasOrSVG = canvasOrSVG[0];
        }
        const DOMContains = document.body.contains(canvasOrSVG);
        if (!DOMContains) {
            // temporarily add to DOM so Firefox can measure it...
            document.body.appendChild(canvasOrSVG);
        }

        const tagName = canvasOrSVG.tagName.toLowerCase();

        if (this.autoBeam === true) {
            try {
                this.makeBeams({ inPlace: true });                
            } catch (e) {
                if (!e.toString().includes('Time Signature')) {
                    throw e;
                }
            }
        }
        const vfr = new vfShow.Renderer(this, canvasOrSVG);
        if (tagName === 'canvas') {
            vfr.rendererType = 'canvas';
        } else if (tagName === 'svg') {
            vfr.rendererType = 'svg';
        }
        vfr.render();
        this.setRenderInteraction(canvasOrSVG);
        this.activeVFRenderer = vfr;
        if (!DOMContains) {
            // remove the adding to DOM so that Firefox could measure it...
            document.body.removeChild(canvasOrSVG);
        }

        return vfr;
    }

    /**
     * Estimate the stream height for the Stream.
     *
     * If there are systems they will be incorporated into the height unless `ignoreSystems` is `true`.
     *
     * @memberof music21.stream.Stream
     * @param {Boolean} [ignoreSystems=false]
     * @returns {number} height in pixels
     */
    estimateStreamHeight(ignoreSystems) {
        const staffHeight = this.renderOptions.naiveHeight;
        let systemPadding = this.systemPadding;
        if (systemPadding === undefined) {
            systemPadding = 0;
        }
        let numSystems;
        if (this.isClassOrSubclass('Score')) {
            const numParts = this.length;
            numSystems = this.numSystems();
            if (numSystems === undefined || ignoreSystems) {
                numSystems = 1;
            }
            const scoreHeight
                = numSystems * staffHeight * numParts
                + (numSystems - 1) * systemPadding;
            // console.log('scoreHeight of ' + scoreHeight);
            return scoreHeight;
        } else if (this.isClassOrSubclass('Part')) {
            numSystems = 1;
            if (!ignoreSystems) {
                numSystems = this.numSystems();
            }
            if (debug) {
                console.log(
                    'estimateStreamHeight for Part: numSystems ['
                        + numSystems
                        + '] * staffHeight ['
                        + staffHeight
                        + '] + (numSystems ['
                        + numSystems
                        + '] - 1) * systemPadding ['
                        + systemPadding
                        + '].'
                );
            }
            return numSystems * staffHeight + (numSystems - 1) * systemPadding;
        } else {
            return staffHeight;
        }
    }

    /**
     * Estimates the length of the Stream in pixels.
     *
     * @memberof music21.stream.Stream
     * @returns {number} length in pixels
     */
    estimateStaffLength() {
        let i;
        let totalLength;
        if (this.renderOptions.overriddenWidth !== undefined) {
            // console.log("Overridden staff width: " + this.renderOptions.overriddenWidth);
            return this.renderOptions.overriddenWidth;
        }
        if (this.hasVoices()) {
            let maxLength = 0;
            for (const v of this) {
                if (v.isClassOrSubclass('Stream')) {
                    const thisLength
                        = v.estimateStaffLength() + v.renderOptions.staffPadding;
                    if (thisLength > maxLength) {
                        maxLength = thisLength;
                    }
                }
            }
            return maxLength;
        } else if (this.hasSubStreams()) {
            // part
            totalLength = 0;
            for (i = 0; i < this.length; i++) {
                const m = this.get(i);
                if (m.isClassOrSubclass('Stream')) {
                    totalLength
                        += m.estimateStaffLength() + m.renderOptions.staffPadding;
                    if (i !== 0 && m.renderOptions.startNewSystem === true) {
                        break;
                    }
                }
            }
            return totalLength;
        } else {
            const rendOp = this.renderOptions;
            totalLength = 30 * this.length;
            totalLength += rendOp.displayClef ? 30 : 0;
            totalLength
                += rendOp.displayKeySignature && this.keySignature
                    ? this.keySignature.width
                    : 0;
            totalLength += rendOp.displayTimeSignature ? 30 : 0;
            // totalLength += rendOp.staffPadding;
            return totalLength;
        }
    }

    //  * ***** MIDI related routines...

    /**
     * Plays the Stream through the MIDI/sound playback (for now, only MIDI.js is supported)
     *
     * `options` can be an object containing:
     * - instrument: {@link music21.instrument.Instrument} object (default, `this.instrument`)
     * - tempo: number (default, `this.tempo`)
     *
     * @memberof music21.stream.Stream
     * @param {object} [options] - object of playback options
     * @returns {music21.stream.Stream} this
     */
    playStream(options) {
        const params = {
            instrument: this.instrument,
            tempo: this.tempo,
            done: undefined,
            startNote: undefined,
        };
        common.merge(params, options);
        const startNoteIndex = params.startNote;
        let currentNoteIndex = 0;
        if (startNoteIndex !== undefined) {
            currentNoteIndex = startNoteIndex;
        }
        const flatEls = this.flat.elements;
        const lastNoteIndex = flatEls.length - 1;
        this._stopPlaying = false;
        const thisStream = this;

        const playNext = function playNext(elements, params) {
            if (currentNoteIndex <= lastNoteIndex && !thisStream._stopPlaying) {
                const el = elements[currentNoteIndex];
                let nextNote;
                let playDuration;
                if (currentNoteIndex < lastNoteIndex) {
                    nextNote = elements[currentNoteIndex + 1];
                    playDuration = nextNote.offset - el.offset;
                } else {
                    playDuration = el.duration.quarterLength;
                }
                const milliseconds = playDuration * 1000 * 60 / params.tempo;
                if (debug) {
                    console.log(
                        'playing: ',
                        el,
                        playDuration,
                        milliseconds,
                        params.tempo
                    );
                }

                if (el.playMidi !== undefined) {
                    el.playMidi(params.tempo, nextNote, params);
                }
                currentNoteIndex += 1;
                setTimeout(() => {
                    playNext(elements, params);
                }, milliseconds);
            } else if (params && params.done) {
                params.done.call();
            }
        };
        playNext(flatEls, params);
        return this;
    }

    /**
     * Stops a stream from playing if it currently is.
     *
     * @memberof music21.stream.Stream
     * @returns {musci21.stream.Stream} this
     */
    stopPlayStream() {
        // turns off all currently playing MIDI notes (on any stream) and stops playback.
        this._stopPlaying = true;
        for (let i = 0; i < 127; i++) {
            MIDI.noteOff(0, i, 0);
        }
        return this;
    }
    /* ----------------------------------------------------------------------
     *
     *  SVG/Canvas DOM routines -- to be factored out eventually.
     *
     */

    createNewCanvas(width, height, elementType = 'svg') {
        console.warn('createNewCanvas is deprecated, use createNewDOM instead');
        return this.createNewDOM(width, height, elementType);
    }

    /**
     * Creates and returns a new `&lt;canvas&gt;` or `&lt;svg&gt;` object.
     *
     * Calls setSubstreamRenderOptions() first.
     *
     * Does not render on the DOM element.
     *
     * @memberof music21.stream.Stream
     * @param {number|string|undefined} width - will use `this.estimateStaffLength()` + `this.renderOptions.staffPadding` if not given
     * @param {number|string|undefined} height - if undefined will use `this.renderOptions.height`. If still undefined, will use `this.estimateStreamHeight()`
     * @param {string} elementType - what type of element, default = svg
     * @returns {JQueryDOMObject} svg in jquery.
     */
    createNewDOM(width, height, elementType = 'svg') {
        if (this.hasSubStreams()) {
            this.setSubstreamRenderOptions();
        }

        // we render SVG on a Div for Vexflow
        let renderElementType = 'div';
        if (elementType === 'canvas') {
            renderElementType = 'canvas';
        }

        const $newCanvasOrDIV = $('<' + renderElementType + '/>');
        $newCanvasOrDIV.addClass('streamHolding'); // .css('border', '1px red solid');
        $newCanvasOrDIV.css('display', 'inline-block');

        if (width !== undefined) {
            if (typeof width === 'string') {
                width = common.stripPx(width);
            }
            $newCanvasOrDIV.attr('width', width);
        } else {
            const computedWidth
                = this.estimateStaffLength()
                + this.renderOptions.staffPadding
                + 0;
            $newCanvasOrDIV.attr('width', computedWidth);
        }
        if (height !== undefined) {
            $newCanvasOrDIV.attr('height', height);
        } else {
            let computedHeight;
            if (this.renderOptions.height === undefined) {
                computedHeight = this.estimateStreamHeight();
                // console.log('computed Height estim: ' + computedHeight);
            } else {
                computedHeight = this.renderOptions.height;
                // console.log('computed Height: ' + computedHeight);
            }
            $newCanvasOrDIV.attr(
                'height',
                computedHeight * this.renderOptions.scaleFactor.y
            );
        }
        return $newCanvasOrDIV;
    }

    createPlayableCanvas(width, height, elementType = 'svg') {
        console.warn(
            'createPlayableCanvas is deprecated, use createPlayableDOM instead'
        );
        return this.createPlayableDOM(width, height, elementType);
    }

    /**
     * Creates a rendered, playable svg where clicking plays it.
     *
     * Called from appendNewDOM() etc.
     *
     * @memberof music21.stream.Stream
     * @param {number|string|undefined} width
     * @param {number|string|undefined} height
     * @param {string} elementType - what type of element, default = svg
     * @returns {JQueryDOMObject} canvas or svg
     */
    createPlayableDOM(width, height, elementType = 'svg') {
        this.renderOptions.events.click = 'play';
        return this.createDOM(width, height, elementType);
    }

    createCanvas(width, height, elementType = 'svg') {
        console.warn('createCanvas is deprecated, use createDOM');
        return this.createDOM(width, height, elementType);
    }
    /**
     * Creates a new svg and renders vexflow on it
     *
     * @memberof music21.stream.Stream
     * @param {number|string|undefined} [width]
     * @param {number|string|undefined} [height]
     * @param {string} elementType - what type of element svg or canvas, default = svg
     * @returns {JQueryDOMObject} canvas or SVG
     */
    createDOM(width, height, elementType = 'svg') {
        const $newSvg = this.createNewDOM(width, height, elementType);
        // temporarily append the SVG to the document to fix a Firefox bug
        // where nothing can be measured unless is it in the document.
        this.renderVexflow($newSvg);
        return $newSvg;
    }

    appendNewCanvas(appendElement, width, height, elementType = 'svg') {
        console.warn('appendNewCanvas is deprecated, use appendNewDOM instead');
        return this.appendNewDOM(appendElement, width, height, elementType);
    }

    /**
     * Creates a new canvas, renders vexflow on it, and appends it to the DOM.
     *
     * @memberof music21.stream.Stream
     * @param {JQueryDOMObject|DOMObject} [appendElement=document.body] - where to place the svg
     * @param {number|string} [width]
     * @param {number|string} [height]
     * @param {string} elementType - what type of element, default = svg
     * @returns {DOMObject} svg (not the jQueryDOMObject -- this is a difference with other routines and should be fixed. TODO: FIX)
     *
     */
    appendNewDOM(appendElement, width, height, elementType = 'svg') {
        if (appendElement === undefined) {
            appendElement = 'body';
        }
        let $appendElement = appendElement;
        if (appendElement.jquery === undefined) {
            $appendElement = $(appendElement);
        }

        //      if (width === undefined && this.renderOptions.maxSystemWidth === undefined) {
        //      var $bodyElement = bodyElement;
        //      if (bodyElement.jquery === undefined) {
        //      $bodyElement = $(bodyElement);
        //      }
        //      width = $bodyElement.width();
        //      };

        const svgOrCanvasBlock = this.createDOM(width, height, elementType);
        $appendElement.append(svgOrCanvasBlock);
        return svgOrCanvasBlock[0];
    }

    replaceCanvas(where, preserveSvgSize, elementType = 'svg') {
        console.warn('replaceCanvas is deprecated, use replaceDOM instead');
        return this.replaceDOM(where, preserveSvgSize, elementType);
    }

    /**
     * Replaces a particular Svg with a new rendering of one.
     *
     * Note that if 'where' is empty, will replace all svges on the page.
     *
     * @memberof music21.stream.Stream
     * @param {JQueryDOMObject|DOMObject} [where] - the canvas or SVG to replace or a container holding the canvas(es) to replace.
     * @param {Boolean} [preserveSvgSize=false]
     * @param {string} elementType - what type of element, default = svg
     * @returns {JQueryDOMObject} the svg
     */
    replaceDOM(where, preserveSvgSize, elementType = 'svg') {
        // if called with no where, replaces all the svges on the page...
        if (where === undefined) {
            where = 'body';
        }
        let $where;
        if (where.jquery === undefined) {
            $where = $(where);
        } else {
            $where = where;
            where = $where[0];
        }
        let $oldSVGOrCanvas;

        if ($where.hasClass('streamHolding')) {
            $oldSVGOrCanvas = $where;
        } else {
            $oldSVGOrCanvas = $where.find('.streamHolding');
        }
        // TODO: Max Width!
        if ($oldSVGOrCanvas.length === 0) {
            throw new Music21Exception('No svg defined for replaceDOM!');
        } else if ($oldSVGOrCanvas.length > 1) {
            // change last svg...
            // replacing each with svgBlock doesn't work
            // anyhow, it just resizes the svg but doesn't
            // draw.
            $oldSVGOrCanvas = $($oldSVGOrCanvas[$oldSVGOrCanvas.length - 1]);
        }

        let svgBlock;
        if (preserveSvgSize) {
            const width = $oldSVGOrCanvas.width() || parseInt($oldSVGOrCanvas.attr('width'));
            const height = $oldSVGOrCanvas.attr('height'); // height manipulates
            svgBlock = this.createDOM(width, height, elementType);
        } else {
            svgBlock = this.createDOM(undefined, undefined, elementType);
        }

        $oldSVGOrCanvas.replaceWith(svgBlock);
        return svgBlock;
    }


    /**
     * Set the type of interaction on the svg based on
     *    - Stream.renderOptions.events.click
     *    - Stream.renderOptions.events.dblclick
     *    - Stream.renderOptions.events.resize
     *
     * Currently the only options available for each are:
     *    - 'play' (string)
     *    - 'reflow' (string; only on event.resize)
     *    - customFunction (will receive event as a first variable; should set up a way to
     *                    find the original stream; var s = this; var f = function () { s...}
     *                   )
     * @memberof music21.stream.Stream
     * @param {DOMObject} canvasOrDiv - canvas or the Div surrounding it.
     * @returns {music21.stream.Stream} this
     */
    setRenderInteraction(canvasOrDiv) {
        let $svg = canvasOrDiv;
        if (canvasOrDiv === undefined) {
            return this;
        } else if (canvasOrDiv.jquery === undefined) {
            $svg = $(canvasOrDiv);
        }
        const playFunc = () => {
            this.playStream();
        };

        $.each(
            this.renderOptions.events,
            $.proxy(function setRenderInteractionProxy(
                eventType,
                eventFunction
            ) {
                $svg.off(eventType);
                if (
                    typeof eventFunction === 'string'
                    && eventFunction === 'play'
                ) {
                    $svg.on(eventType, playFunc);
                } else if (
                    typeof eventFunction === 'string'
                    && eventType === 'resize'
                    && eventFunction === 'reflow'
                ) {
                    this.windowReflowStart($svg);
                } else if (eventFunction !== undefined) {
                    $svg.on(eventType, eventFunction);
                }
            },
            this)
        );
        return this;
    }

    /**
     *
     * Recursively search downward for the closest storedVexflowStave...
     *
     * @memberof music21.stream.Stream
     * @returns {Vex.Flow.Stave|undefined}
     */
    recursiveGetStoredVexflowStave() {
        let storedVFStave = this.storedVexflowStave;
        if (storedVFStave === undefined) {
            if (!this.hasSubStreams()) {
                return undefined;
            } else {
                const subStreams = this.getElementsByClass('Stream');
                storedVFStave = subStreams.get(0).storedVexflowStave;
                if (storedVFStave === undefined) {
                    // TODO: bad programming ... should support continuous recurse
                    // but good enough for now...
                    if (subStreams.get(0).hasSubStreams()) {
                        storedVFStave = subStreams.get(0).get(0)
                            .storedVexflowStave;
                    }
                }
            }
        }
        return storedVFStave;
    }

    getUnscaledXYforCanvas(svg, e) {
        console.warn(
            'getUnscaledXYforCanvas is deprecated, use getUnscaledXYforDOM instead'
        );
        return this.getUnscaledXYforDOM(svg, e);
    }

    /**
     * Given a mouse click, or other event with .pageX and .pageY,
     * find the x and y for the svg.
     *
     * @memberof music21.stream.Stream
     * @param {DOMObject} svg - a canvas or SVG object
     * @param {Event} e
     * @returns {Array<number>} two-elements, [x, y] in pixels.
     */
    getUnscaledXYforDOM(svg, e) {
        let offset = null;
        if (svg === undefined) {
            offset = { left: 0, top: 0 };
        } else {
            offset = $(svg).offset();
        }
        /*
         * mouse event handler code from: http://diveintohtml5.org/canvas.html
         */
        let xClick;
        let yClick;
        if (e.pageX !== undefined && e.pageY !== undefined) {
            xClick = e.pageX;
            yClick = e.pageY;
        } else {
            xClick
                = e.clientX
                + document.body.scrollLeft
                + document.documentElement.scrollLeft;
            yClick
                = e.clientY
                + document.body.scrollTop
                + document.documentElement.scrollTop;
        }
        const xPx = xClick - offset.left;
        const yPx = yClick - offset.top;
        return [xPx, yPx];
    }

    getScaledXYforCanvas(svg, e) {
        console.warn(
            'getScaledXYforCanvas is deprecated, use getScaledXYforDOM instead'
        );
        return this.getScaledXYforDOM(svg, e);
    }

    /**
     * return a list of [scaledX, scaledY] for
     * a svg element.
     *
     * xScaled refers to 1/scaleFactor.x -- for instance, scaleFactor.x = 0.7 (default)
     * x of 1 gives 1.42857...
     *
     * @memberof music21.stream.Stream
     * @param {DOMObject} svg -- a canvas or SVG object
     * @param {Event} e
     * @returns {Array<number>} [scaledX, scaledY]
     */
    getScaledXYforDOM(svg, e) {
        const [xPx, yPx] = this.getUnscaledXYforDOM(svg, e);
        const pixelScaling = this.renderOptions.scaleFactor;

        const yPxScaled = yPx / pixelScaling.y;
        const xPxScaled = xPx / pixelScaling.x;
        return [xPxScaled, yPxScaled];
    }
    /**
     *
     * Given a Y position find the diatonicNoteNum that a note at that position would have.
     *
     * searches this.storedVexflowStave
     *
     * Y position must be offset from the start of the stave...
     *
     * @memberof music21.stream.Stream
     * @param {number} yPxScaled
     * @returns {Int}
     */
    diatonicNoteNumFromScaledY(yPxScaled) {
        const storedVFStave = this.recursiveGetStoredVexflowStave();
        // for (var i = -10; i < 10; i++) {
        //    console.log("line: " + i + " y: " + storedVFStave.getYForLine(i));
        // }
        const lineSpacing = storedVFStave.options.spacing_between_lines_px;
        const linesAboveStaff = storedVFStave.options.space_above_staff_ln;

        const notesFromTop = yPxScaled * 2 / lineSpacing;
        const notesAboveLowestLine
            = (storedVFStave.options.num_lines - 1 + linesAboveStaff) * 2
            - notesFromTop;
        const clickedDiatonicNoteNum
            = this.clef.lowestLine + Math.round(notesAboveLowestLine);
        return clickedDiatonicNoteNum;
    }

    /**
     * Returns the stream that is at X location xPxScaled and system systemIndex.
     *
     * Override in subclasses, always returns this; here.
     *
     * @memberof music21.stream.Stream
     * @param {number} [xPxScaled]
     * @param {number} [allowablePixels=10]
     * @param {number} [systemIndex]
     * @returns {music21.stream.Stream}
     *
     */
    getStreamFromScaledXandSystemIndex(xPxScaled, systemIndex) {
        return this;
    }

    /**
     *
     * Return the note at pixel X (or within allowablePixels [default 10])
     * of the note.
     *
     * systemIndex element is not used on bare Stream
     *
     * options can be a dictionary of: 'allowBackup' which gets the closest
     * note within the window even if it's beyond allowablePixels (default: true)
     * and 'backupMaximum' which specifies a maximum distance even for backup
     * (default: 70);
     *
     * @memberof music21.stream.Stream
     * @param {number} xPxScaled
     * @param {number} [allowablePixels=10]
     * @param {number} [systemIndex]
     * @param {object} [options]
     * @returns {music21.base.Music21Object|undefined}
     */
    noteElementFromScaledX(xPxScaled, allowablePixels, systemIndex, options) {
        const params = {
            allowBackup: true,
            backupMaximum: 70,
        };
        common.merge(params, options);
        let foundNote;
        if (allowablePixels === undefined) {
            allowablePixels = 10;
        }
        const subStream = this.getStreamFromScaledXandSystemIndex(
            xPxScaled,
            systemIndex
        );
        if (subStream === undefined) {
            return undefined;
        }
        const backup = {
            minDistanceSoFar: params.backupMaximum,
            note: undefined,
        }; // a backup in case we did not find within allowablePixels

        for (const n of subStream.flat.notesAndRests.elements) {
            /* should also
             * compensate for accidentals...
             */
            const leftDistance = Math.abs(n.x - xPxScaled);
            const rightDistance = Math.abs(n.x + n.width - xPxScaled);
            const minDistance = Math.min(leftDistance, rightDistance);

            if (
                leftDistance < allowablePixels
                && rightDistance < allowablePixels
            ) {
                foundNote = n;
                break; /* O(n); can be made O(log n) */
            } else if (
                leftDistance < params.backupMaximum
                && rightDistance < params.backupMaximum
                && minDistance < backup.minDistanceSoFar
            ) {
                backup.note = n;
                backup.minDistanceSoFar = minDistance;
            }
        }
        // console.log('note here is: ', foundNote);
        if (params.allowBackup && foundNote === undefined) {
            foundNote = backup.note;
            // console.log('used backup: closest was: ', backup.minDistanceSoFar);
        }
        // console.log(foundNote);
        return foundNote;
    }

    /**
     * Given an event object, and an x and y location, returns a two-element array
     * of the pitch.Pitch.diatonicNoteNum that was clicked (i.e., if C4 was clicked this
     * will return 29; if D4 was clicked this will return 30) and the closest note in the
     * stream that was clicked.
     *
     * Return a list of [diatonicNoteNum, closestXNote]
     * for an event (e) called on the svg (svg)
     *
     * @memberof music21.stream.Stream
     * @param {DOMObject} svg
     * @param {Event} e
     * @param {number} x
     * @param {number} y
     * @returns {Array} [diatonicNoteNum, closestXNote]
     */
    findNoteForClick(svg, e, x, y) {
        if (x === undefined || y === undefined) {
            [x, y] = this.getScaledXYforDOM(svg, e);
        }
        const clickedDiatonicNoteNum = this.diatonicNoteNumFromScaledY(y);
        const foundNote = this.noteElementFromScaledX(x);
        return [clickedDiatonicNoteNum, foundNote];
    }

    /**
     * Change the pitch of a note given that it has been clicked and then
     * call changedCallbackFunction
     *
     * To be removed...
     *
     * @memberof music21.stream.Stream
     * @param {Int} clickedDiatonicNoteNum
     * @param {music21.base.Music21Object} foundNote
     * @param {DOMObject} svg
     * @returns {any} output of changedCallbackFunction
     */
    noteChanged(clickedDiatonicNoteNum, foundNote, svg) {
        const n = foundNote;
        const p = new pitch.Pitch('C');
        p.diatonicNoteNum = clickedDiatonicNoteNum;
        p.accidental = n.pitch.accidental;
        n.pitch = p;
        n.stemDirection = undefined;
        this.activeNote = n;
        const $newSvg = this.redrawDOM(svg);
        const params = { foundNote: n, svg: $newSvg };
        if (this.changedCallbackFunction !== undefined) {
            return this.changedCallbackFunction(params);
        } else {
            return params;
        }
    }

    redrawCanvas(svg) {
        console.warn('redrawCanvas is deprecated, use redrawDOM instead');
        return this.redrawDOM(svg);
    }

    /**
     * Redraws an svgDiv, keeping the events of the previous svg.
     *
     * @memberof music21.stream.Stream
     * @param {DOMObject} svg
     * @returns {music21.stream.Stream} this
     */
    redrawDOM(svg) {
        // this.resetRenderOptions(true, true); // recursive, preserveEvents
        // this.setSubstreamRenderOptions();
        const $svg = $(svg); // works even if svg is already $jquery
        const $newSvg = this.createNewDOM(svg.width, svg.height);
        this.renderVexflow($newSvg);
        $svg.replaceWith($newSvg);
        // this is no longer necessary.
        // common.jQueryEventCopy($.event, $svg, $newCanv); /* copy events -- using custom extension... */
        return $newSvg;
    }

    editableAccidentalCanvas(width, height) {
        console.warn(
            'editableAccidentalCanvas is deprecated, use editableAccidentalDOM instead'
        );
        return this.editableAccidentalDOM(width, height);
    }

    /**
     * Renders a stream on svg with the ability to edit it and
     * a toolbar that allows the accidentals to be edited.
     *
     * @memberof music21.stream.Stream
     * @param {number} [width]
     * @param {number} [height]
     * @returns {DOMObject} &lt;div&gt; tag around the svg.
     */
    editableAccidentalDOM(width, height) {
        /*
         * Create an editable svg with an accidental selection bar.
         */
        const d = $('<div/>')
            .css('text-align', 'left')
            .css('position', 'relative');

        this.renderOptions.events.click = this.DOMChangerFunction;
        const $svgDiv = this.createDOM(width, height);
        const buttonDiv = this.getAccidentalToolbar(
            undefined,
            undefined,
            $svgDiv
        );
        d.append(buttonDiv);
        d.append($("<br clear='all'/>"));
        d.append($svgDiv);
        return d;
    }

    /*
     * SVG toolbars...
     */

    /**
     *
     * @memberof music21.stream.Stream
     * @param {Int} minAccidental - alter of the min accidental (default -1)
     * @param {Int} maxAccidental - alter of the max accidental (default 1)
     * @param {jQueryObject} $siblingSvg - svg to use for redrawing;
     * @returns {jQueryObject} the accidental toolbar.
     */
    getAccidentalToolbar(minAccidental, maxAccidental, $siblingSvg) {
        if (minAccidental === undefined) {
            minAccidental = -1;
        }
        if (maxAccidental === undefined) {
            maxAccidental = 1;
        }
        minAccidental = Math.round(minAccidental);
        maxAccidental = Math.round(maxAccidental);

        const addAccidental = (newAlter, clickEvent) => {
            /*
             * To be called on a button...
             */
            let $useSvg = $siblingSvg;
            if ($useSvg === undefined) {
                let $searchParent = $(clickEvent.target).parent();
                let maxSearch = 99;
                while (
                    maxSearch > 0
                    && $searchParent !== undefined
                    && ($useSvg === undefined || $useSvg[0] === undefined)
                ) {
                    maxSearch -= 1;
                    $useSvg = $searchParent.find('.streamHolding');
                    $searchParent = $searchParent.parent();
                }
                if ($useSvg[0] === undefined) {
                    console.log('Could not find a svg...');
                    return;
                }
            }
            if (this.activeNote !== undefined) {
                const n = this.activeNote;
                n.pitch.accidental = new pitch.Accidental(newAlter);
                /* console.log(n.pitch.name); */
                const $newSvg = this.redrawDOM($useSvg[0]);
                if (this.changedCallbackFunction !== undefined) {
                    this.changedCallbackFunction({
                        foundNote: n,
                        svg: $newSvg,
                    });
                }
            }
        };

        const $buttonDiv = $('<div/>').attr(
            'class',
            'accidentalToolbar scoreToolbar'
        );
        for (let i = minAccidental; i <= maxAccidental; i++) {
            const acc = new pitch.Accidental(i);
            const $button = $(
                '<button>' + acc.unicodeModifier + '</button>'
            ).click(e => addAccidental(i, e));
            if (Math.abs(i) > 1) {
                $button.css('font-family', 'Bravura Text');
                $button.css('font-size', '20px');
            }
            $buttonDiv.append($button);
        }
        return $buttonDiv;
    }
    /**
     *
     * @memberof music21.stream.Stream
     * @returns {jQueryObject} a Div containing two buttons -- play and stop
     */
    getPlayToolbar() {
        const $buttonDiv = $('<div/>').attr(
            'class',
            'playToolbar scoreToolbar'
        );
        const $bPlay = $('<button>&#9658</button>');
        $bPlay.click(() => {
            this.playStream();
        });
        $buttonDiv.append($bPlay);
        const $bStop = $('<button>&#9724</button>');
        $bStop.click(() => {
            this.stopPlayStream();
        });
        $buttonDiv.append($bStop);
        return $buttonDiv;
    }
    //  reflow

    /**
     * Begins a series of bound events to the window that makes it
     * so that on resizing the stream is redrawn and reflowed to the
     * new size.
     *
     * @memberof music21.stream.Stream
     * @param {JQueryDOMObject} jSvg
     * @returns {music21.stream.Stream} this
     */
    windowReflowStart(jSvg) {
        // set up a bunch of windowReflow bindings that affect the svg.
        const callingStream = this;
        let jSvgNow = jSvg;
        $(window).bind('resizeEnd', () => {
            // do something, window hasn't changed size in 500ms
            const jSvgParent = jSvgNow.parent();
            const newWidth = jSvgParent.width();
            const svgWidth = newWidth;
            // console.log(svgWidth);
            console.log('resizeEnd triggered', newWidth);
            // console.log(callingStream.renderOptions.events.click);
            callingStream.resetRenderOptions(true, true); // recursive, preserveEvents
            // console.log(callingStream.renderOptions.events.click);
            callingStream.maxSystemWidth = svgWidth - 40;
            jSvgNow.remove();
            const svgObj = callingStream.appendNewDOM(jSvgParent);
            jSvgNow = $(svgObj);
        });
        $(window).resize(function resizeSvgTo() {
            if (this.resizeTO) {
                clearTimeout(this.resizeTO);
            }
            this.resizeTO = setTimeout(function resizeToTimeout() {
                $(this).trigger('resizeEnd');
            }, 200);
        });
        setTimeout(function triggerResizeOnCreateSvg() {
            const $window = $(window);
            const doResize = $window.data('triggerResizeOnCreateSvg');
            if (doResize === undefined || doResize === true) {
                $(this).trigger('resizeEnd');
                $window.data('triggerResizeOnCreateSvg', false);
            }
        }, 1000);
        return this;
    }
    /**
     * Does this stream have a {@link music21.stream.Voice} inside it?
     *
     * @memberof music21.stream.Stream
     * @returns {Boolean}
     */
    hasVoices() {
        for (const el of this) {
            if (el.isClassOrSubclass('Voice')) {
                return true;
            }
        }
        return false;
    }
}
stream.Stream = Stream;

/**
 *
 * @class Voice
 * @memberof music21.stream
 * @extends music21.stream.Stream
 */
export class Voice extends Stream {
    constructor() {
        super();
        this.recursionType = 'elementsFirst';
    }
}
stream.Voice = Voice;

/**
 * @class Measure
 * @memberof music21.stream
 * @extends music21.stream.Stream
 */
export class Measure extends Stream {
    constructor() {
        super();
        this.recursionType = 'elementsFirst';
        this.isMeasure = true;
        this.number = 0; // measure number
    }
}
stream.Measure = Measure;

/**
 * Part -- specialized to handle Measures inside it
 *
 * @class Part
 * @memberof music21.stream
 * @extends music21.stream.Stream
 */
export class Part extends Stream {
    constructor() {
        super();
        this.recursionType = 'flatten';
        this.systemHeight = this.renderOptions.naiveHeight;
    }

    /**
     * How many systems does this Part have?
     *
     * Does not change any reflow information, so by default it's always 1.
     *
     * @memberof music21.stream.Part
     * @returns {Number}
     */
    numSystems() {
        let numSystems = 1;
        const subStreams = this.getElementsByClass('Stream');
        for (let i = 1; i < subStreams.length; i++) {
            if (subStreams.get(i).renderOptions.startNewSystem) {
                numSystems += 1;
            }
        }
        return numSystems;
    }

    /**
     * Find the width of every measure in the Part.
     *
     * @memberof music21.stream.Part
     * @returns {Array<number>}
     */
    getMeasureWidths() {
        /* call after setSubstreamRenderOptions */
        const measureWidths = [];
        for (const el of this) {
            if (el.isClassOrSubclass('Measure')) {
                const elRendOp = el.renderOptions;
                measureWidths[elRendOp.measureIndex] = elRendOp.width;
            }
        }
        /* console.log(measureWidths);
         *
         */
        return measureWidths;
    }
    /**
     * Overrides the default music21.stream.Stream#estimateStaffLength
     *
     * @memberof music21.stream.Part
     * @returns {number}
     */
    estimateStaffLength() {
        if (this.renderOptions.overriddenWidth !== undefined) {
            // console.log("Overridden staff width: " + this.renderOptions.overriddenWidth);
            return this.renderOptions.overriddenWidth;
        }
        if (this.hasSubStreams()) {
            // part with Measures underneath
            let totalLength = 0;
            let isFirst = true;
            for (const m of this.getElementsByClass('Measure')) {
                // this looks wrong, but actually seems to be right. moving it to
                // after the break breaks things.
                totalLength
                    += m.estimateStaffLength() + m.renderOptions.staffPadding;
                if (!isFirst && m.renderOptions.startNewSystem === true) {
                    break;
                }
                isFirst = false;
            }
            return totalLength;
        }
        // no measures found in part... treat as measure
        const tempM = new stream.Measure();
        tempM.elements = this.elements;
        return tempM.estimateStaffLength();
    }
    /**
     * Divide a part up into systems and fix the measure
     * widths so that they are all even.
     *
     * Note that this is done on the part level even though
     * the measure widths need to be consistent across parts.
     *
     * This is possible because the system is deterministic and
     * will come to the same result for each part.  Opportunity
     * for making more efficient through this...
     *
     * @memberof music21.stream.Part
     * @param systemHeight
     * @returns {Array}
     */
    fixSystemInformation(systemHeight) {
        /*
         * console.log('system height: ' + systemHeight);
         */
        if (systemHeight === undefined) {
            systemHeight = this.systemHeight; /* part.show() called... */
        } else if (debug) {
            console.log('overridden systemHeight: ' + systemHeight);
        }
        const systemPadding
            = this.renderOptions.systemPadding
            || this.renderOptions.naiveSystemPadding;
        const measureWidths = this.getMeasureWidths();
        const maxSystemWidth = this.maxSystemWidth; /* of course fix! */
        const systemCurrentWidths = [];
        const systemBreakIndexes = [];
        let lastSystemBreak = 0; /* needed to ensure each line has at least one measure */
        const startLeft = 20; /* TODO: make it obtained elsewhere */
        let currentLeft = startLeft;
        let i;
        for (i = 0; i < measureWidths.length; i++) {
            const currentRight = currentLeft + measureWidths[i];
            /* console.log("left: " + currentLeft + " ; right: " + currentRight + " ; m: " + i); */
            if (currentRight > maxSystemWidth && lastSystemBreak !== i) {
                systemBreakIndexes.push(i - 1);
                systemCurrentWidths.push(currentLeft);

                // console.log('setting new width at ' + currentLeft);
                currentLeft = startLeft + measureWidths[i]; // 20 + this width;
                lastSystemBreak = i;
            } else {
                currentLeft = currentRight;
            }
        }
        // console.log(systemCurrentWidths);
        // console.log(systemBreakIndexes);

        let currentSystemIndex = 0;
        let leftSubtract = 0;
        let newLeftSubtract;
        for (i = 0; i < this.length; i++) {
            const m = this.get(i);
            if (m.renderOptions === undefined) {
                continue;
            }
            if (i === 0) {
                m.renderOptions.startNewSystem = true;
            }
            currentLeft = m.renderOptions.left;

            if (systemBreakIndexes.indexOf(i - 1) !== -1) {
                /* first measure of new System */
                const oldWidth = m.renderOptions.width;
                m.renderOptions.displayClef = true;
                m.renderOptions.displayKeySignature = true;
                m.renderOptions.startNewSystem = true;

                const newWidth
                    = m.estimateStaffLength() + m.renderOptions.staffPadding;
                m.renderOptions.width = newWidth;
                leftSubtract = currentLeft - 20;
                // after this one, we'll have a new left subtract...
                newLeftSubtract = leftSubtract - (newWidth - oldWidth);

                currentSystemIndex += 1;
            } else if (i !== 0) {
                m.renderOptions.startNewSystem = false;
                m.renderOptions.displayClef = false; // check for changed clef first?
                m.renderOptions.displayKeySignature = false; // check for changed KS first?
            }
            m.renderOptions.systemIndex = currentSystemIndex;
            let currentSystemMultiplier;
            if (currentSystemIndex >= systemCurrentWidths.length) {
                /* last system... non-justified */
                currentSystemMultiplier = 1;
            } else {
                const currentSystemWidth
                    = systemCurrentWidths[currentSystemIndex];
                currentSystemMultiplier = maxSystemWidth / currentSystemWidth;
                // console.log('systemMultiplier: ' + currentSystemMultiplier + ' max: ' + maxSystemWidth + ' current: ' + currentSystemWidth);
            }
            /* might make a small gap? fix? */
            const newLeft = currentLeft - leftSubtract;
            if (newLeftSubtract !== undefined) {
                leftSubtract = newLeftSubtract;
                newLeftSubtract = undefined;
            }
            // console.log('M: ' + i + ' ; old left: ' + currentLeft + ' ; new Left: ' + newLeft);
            m.renderOptions.left = Math.floor(
                newLeft * currentSystemMultiplier
            );
            m.renderOptions.width = Math.floor(
                m.renderOptions.width * currentSystemMultiplier
            );
            const newTop
                = m.renderOptions.top
                + currentSystemIndex * (systemHeight + systemPadding);
            // console.log('M: ' + i + '; New top: ' + newTop + " ; old Top: " + m.renderOptions.top);
            m.renderOptions.top = newTop;
        }

        return systemCurrentWidths;
    }
    /**
     * overrides music21.stream.Stream#setSubstreamRenderOptions
     *
     * figures out the `.left` and `.top` attributes for all contained measures
     *
     * @memberof music21.stream.Part
     */
    setSubstreamRenderOptions() {
        let currentMeasureIndex = 0; /* 0 indexed for now */
        let currentMeasureLeft = 20;
        const rendOp = this.renderOptions;
        let lastTimeSignature;
        let lastKeySignature;
        let lastClef;

        for (const el of this) {
            if (el.isClassOrSubclass('Measure')) {
                const elRendOp = el.renderOptions;
                elRendOp.measureIndex = currentMeasureIndex;
                elRendOp.top = rendOp.top;
                elRendOp.partIndex = rendOp.partIndex;
                elRendOp.left = currentMeasureLeft;

                if (currentMeasureIndex === 0) {
                    lastClef = el._clef;
                    lastTimeSignature = el._timeSignature;
                    lastKeySignature = el._keySignature;

                    elRendOp.displayClef = true;
                    elRendOp.displayKeySignature = true;
                    elRendOp.displayTimeSignature = true;
                } else {
                    if (
                        el._clef !== undefined
                        && lastClef !== undefined
                        && el._clef.name !== lastClef.name
                    ) {
                        console.log(
                            'changing clefs for ',
                            elRendOp.measureIndex,
                            ' from ',
                            lastClef.name,
                            ' to ',
                            el._clef.name
                        );
                        lastClef = el._clef;
                        elRendOp.displayClef = true;
                    } else {
                        elRendOp.displayClef = false;
                    }

                    if (
                        el._keySignature !== undefined
                        && lastKeySignature !== undefined
                        && el._keySignature.sharps !== lastKeySignature.sharps
                    ) {
                        lastKeySignature = el._keySignature;
                        elRendOp.displayKeySignature = true;
                    } else {
                        elRendOp.displayKeySignature = false;
                    }

                    if (
                        el._timeSignature !== undefined
                        && lastTimeSignature !== undefined
                        && el._timeSignature.ratioString
                            !== lastTimeSignature.ratioString
                    ) {
                        lastTimeSignature = el._timeSignature;
                        elRendOp.displayTimeSignature = true;
                    } else {
                        elRendOp.displayTimeSignature = false;
                    }
                }
                elRendOp.width
                    = el.estimateStaffLength() + elRendOp.staffPadding;
                elRendOp.height = el.estimateStreamHeight();
                currentMeasureLeft += elRendOp.width;
                currentMeasureIndex += 1;
            }
        }
        return this;
    }

    /**
     * systemIndexAndScaledY - given a scaled Y, return the systemIndex
     * and the scaledYRelativeToSystem
     *
     * @memberof music21.stream.Part
     * @param  {number} y the scaled Y
     * @return Array<int, number>   systemIndex, scaledYRelativeToSystem
     */
    systemIndexAndScaledY(y) {
        let systemPadding = this.renderOptions.systemPadding;
        if (systemPadding === undefined) {
            systemPadding = this.renderOptions.naiveSystemPadding;
        }
        const systemIndex = Math.floor(y / (this.systemHeight + systemPadding));
        const scaledYRelativeToSystem
            = y - systemIndex * (this.systemHeight + systemPadding);
        return [systemIndex, scaledYRelativeToSystem];
    }

    /**
     * Overrides the default music21.stream.Stream#findNoteForClick
     * by taking into account systems
     *
     * @memberof music21.stream.Part
     * @param {DOMObject} svg
     * @param {Event} e
     * @returns {Array} [clickedDiatonicNoteNum, foundNote]
     */
    findNoteForClick(svg, e) {
        const [x, y] = this.getScaledXYforDOM(svg, e);

        // debug = true;
        if (debug) {
            console.log(
                'this.estimateStreamHeight(): '
                    + this.estimateStreamHeight()
                    + ' / $(svg).height(): '
                    + $(svg).height()
            );
        }
        let systemPadding = this.renderOptions.systemPadding;
        if (systemPadding === undefined) {
            systemPadding = this.renderOptions.naiveSystemPadding;
        }
        const [systemIndex, scaledYRelativeToSystem] = this.systemIndexAndScaledY(y);
        const clickedDiatonicNoteNum = this.diatonicNoteNumFromScaledY(
            scaledYRelativeToSystem
        );

        const foundNote = this.noteElementFromScaledX(
            x,
            undefined,
            systemIndex
        );
        return [clickedDiatonicNoteNum, foundNote];
    }

    /**
     * Returns the measure that is at X location xPxScaled and system systemIndex.
     *
     * @memberof music21.stream.Part
     * @param {number} [xPxScaled]
     * @param {number} [systemIndex]
     * @returns {music21.stream.Stream}
     *
     */
    getStreamFromScaledXandSystemIndex(xPxScaled, systemIndex) {
        let gotMeasure;
        const measures = this.measures;
        for (const m of measures) {
            const rendOp = m.renderOptions;
            const left = rendOp.left;
            const right = left + rendOp.width;
            const top = rendOp.top;
            const bottom = top + rendOp.height;
            if (debug) {
                console.log(
                    'Searching for X:'
                        + Math.round(xPxScaled)
                        + ' in Measure '
                        + ' with boundaries L:'
                        + left
                        + ' R:'
                        + right
                        + ' T: '
                        + top
                        + ' B: '
                        + bottom
                );
            }
            if (xPxScaled >= left && xPxScaled <= right) {
                if (systemIndex === undefined) {
                    gotMeasure = m;
                    break;
                } else if (rendOp.systemIndex === systemIndex) {
                    gotMeasure = m;
                    break;
                }
            }
        }
        return gotMeasure;
    }
}
stream.Part = Part;

/**
 * Scores with multiple parts
 *
 * @class Score
 * @memberof music21.stream
 * @extends music21.stream.Stream
 */
export class Score extends Stream {
    constructor() {
        super();
        this.recursionType = 'elementsOnly';
        this.measureWidths = [];
        this.partSpacing = this.renderOptions.naiveHeight;
    }
    get systemPadding() {
        const numParts = this.parts.length;
        let systemPadding = this.renderOptions.systemPadding;
        if (systemPadding === undefined) {
            if (numParts === 1) {
                systemPadding = this.renderOptions.naiveSystemPadding; // fix to 0
            } else {
                systemPadding = this.renderOptions.naiveSystemPadding;
            }
        }
        return systemPadding;
    }

    /**
     * Returns the measure that is at X location xPxScaled and system systemIndex.
     *
     * Always returns the measure of the top part...
     *
     * @memberof music21.stream.Score
     * @param {number} [xPxScaled]
     * @param {number} [systemIndex]
     * @returns {music21.stream.Stream} usually a Measure
     *
     */
    getStreamFromScaledXandSystemIndex(xPxScaled, systemIndex) {
        const parts = this.parts;
        return parts
            .get(0)
            .getStreamFromScaledXandSystemIndex(xPxScaled, systemIndex);
    }
    /**
     * overrides music21.stream.Stream#setSubstreamRenderOptions
     *
     * figures out the `.left` and `.top` attributes for all contained parts
     *
     * @memberof music21.stream.Score
     * @returns {music21.stream.Score} this
     */
    setSubstreamRenderOptions() {
        let currentPartNumber = 0;
        let currentPartTop = 0;
        const partSpacing = this.partSpacing;
        for (const el of this) {
            if (el.isClassOrSubclass('Part')) {
                el.renderOptions.partIndex = currentPartNumber;
                el.renderOptions.top = currentPartTop;
                el.setSubstreamRenderOptions();
                currentPartTop += partSpacing;
                currentPartNumber += 1;
            }
        }
        this.evenPartMeasureSpacing();
        const ignoreNumSystems = true;
        const currentScoreHeight = this.estimateStreamHeight(ignoreNumSystems);
        for (const el of this) {
            if (el.isClassOrSubclass('Part')) {
                el.fixSystemInformation(currentScoreHeight);
            }
        }
        this.renderOptions.height = this.estimateStreamHeight();
        return this;
    }
    /**
     * Overrides the default music21.stream.Stream#estimateStaffLength
     *
     * @memberof music21.stream.Score
     * @returns {number}
     */
    estimateStaffLength() {
        // override
        if (this.renderOptions.overriddenWidth !== undefined) {
            // console.log("Overridden staff width: " + this.renderOptions.overriddenWidth);
            return this.renderOptions.overriddenWidth;
        }
        for (const p of this) {
            if (p.isClassOrSubclass('Part')) {
                return p.estimateStaffLength();
            }
        }
        // no parts found in score... use part...
        console.log('no parts found in score');
        const tempPart = new stream.Part();
        tempPart.elements = this.elements;
        return tempPart.estimateStaffLength();
    }

    /* MIDI override */
    /**
     * Overrides the default music21.stream.Stream#playStream
     *
     * Works crappily -- just starts *n* midi players.
     *
     * Render scrollable score works better...
     *
     * @memberof music21.stream.Score
     * @param {object} params -- passed to each part
     * @returns {music21.stream.Score} this
     */
    playStream(params) {
        // play multiple parts in parallel...
        for (const el of this) {
            if (el.isClassOrSubclass('Part')) {
                el.playStream(params);
            }
        }
        return this;
    }
    /**
     * Overrides the default music21.stream.Stream#stopPlayScore()
     *
     * @memberof music21.stream.Score
     * @returns {music21.stream.Score} this
     */
    stopPlayStream() {
        for (const el of this) {
            if (el.isClassOrSubclass('Part')) {
                el.stopPlayStream();
            }
        }
        return this;
    }
    /*
     * Svg routines
     */
    /**
     * call after setSubstreamRenderOptions
     * gets the maximum measure width for each measure
     * by getting the maximum for each measure of
     * Part.getMeasureWidths();
     *
     * Does this work? I found a bug in this and fixed it that should have
     * broken it!
     *
     * @memberof music21.stream.Score
     * @returns Array<number>
     */
    getMaxMeasureWidths() {
        const maxMeasureWidths = [];
        const measureWidthsArrayOfArrays = [];
        let i;
        // TODO: Do not crash on not partlike...
        for (const el of this) {
            measureWidthsArrayOfArrays.push(el.getMeasureWidths());
        }
        for (i = 0; i < measureWidthsArrayOfArrays[0].length; i++) {
            let maxFound = 0;
            for (let j = 0; j < this.length; j++) {
                if (measureWidthsArrayOfArrays[j][i] > maxFound) {
                    maxFound = measureWidthsArrayOfArrays[j][i];
                }
            }
            maxMeasureWidths.push(maxFound);
        }
        // console.log(measureWidths);
        return maxMeasureWidths;
    }

    /**
     * systemIndexAndScaledY - given a scaled Y, return the systemIndex
     * and the scaledYRelativeToSystem
     *
     * @memberof music21.stream.Score
     * @param  {number} y the scaled Y
     * @return Array<int, number>   systemIndex, scaledYRelativeToSystem
     */
    systemIndexAndScaledY(y) {
        let systemPadding = this.renderOptions.systemPadding;
        if (systemPadding === undefined) {
            systemPadding = this.renderOptions.naiveSystemPadding;
        }

        const numParts = this.parts.length;
        const systemHeight = numParts * this.partSpacing + this.systemPadding;
        const systemIndex = Math.floor(y / systemHeight);
        const scaledYRelativeToSystem = y - systemIndex * systemHeight;
        return [systemIndex, scaledYRelativeToSystem];
    }

    /**
     * Returns a list of [clickedDiatonicNoteNum, foundNote] for a
     * click event, taking into account that the note will be in different
     * Part objects (and different Systems) given the height and possibly different Systems.
     *
     * @memberof music21.stream.Score
     * @param {DOMObject} svg
     * @param {Event} e
     * @returns {Array} [diatonicNoteNum, m21Element]
     */
    findNoteForClick(svg, e) {
        const [x, y] = this.getScaledXYforDOM(svg, e);
        const [systemIndex, scaledYFromSystemTop] = this.systemIndexAndScaledY(
            y
        );
        const partIndex = Math.floor(scaledYFromSystemTop / this.partSpacing);
        const scaledYinPart
            = scaledYFromSystemTop - partIndex * this.partSpacing;
        // console.log('systemIndex: ' + systemIndex + " partIndex: " + partIndex);
        const rightPart = this.get(partIndex);
        if (rightPart === undefined) {
            return [undefined, undefined]; // may be too low?
        }

        const clickedDiatonicNoteNum = rightPart.diatonicNoteNumFromScaledY(
            scaledYinPart
        );

        const foundNote = rightPart.noteElementFromScaledX(
            x,
            undefined,
            systemIndex
        );
        return [clickedDiatonicNoteNum, foundNote];
    }

    /**
     * How many systems are there? Calls numSystems() on the first part.
     *
     * @memberof music21.stream.Score
     * @returns {Int}
     */
    numSystems() {
        return this.getElementsByClass('Part')
            .get(0)
            .numSystems();
    }

    /**
     * Fixes the part measure spacing for all parts.
     *
     * @memberof music21.stream.Score
     * @returns {music21.stream.Score} this
     */
    evenPartMeasureSpacing() {
        const measureStacks = [];
        let currentPartNumber = 0;
        const maxMeasureWidth = [];
        let j;
        for (const el of this) {
            if (el.isClassOrSubclass('Part')) {
                const measureWidths = el.getMeasureWidths();
                for (j = 0; j < measureWidths.length; j++) {
                    const thisMeasureWidth = measureWidths[j];
                    if (measureStacks[j] === undefined) {
                        measureStacks[j] = [];
                        maxMeasureWidth[j] = thisMeasureWidth;
                    } else if (thisMeasureWidth > maxMeasureWidth[j]) {
                        maxMeasureWidth[j] = thisMeasureWidth;
                    }
                    measureStacks[j][currentPartNumber] = thisMeasureWidth;
                }
                currentPartNumber += 1;
            }
        }
        let currentLeft = 20;
        for (let i = 0; i < maxMeasureWidth.length; i++) {
            // TODO: do not assume, only elements in Score are Parts and in Parts are Measures...
            const measureNewWidth = maxMeasureWidth[i];
            for (j = 0; j < this.length; j++) {
                const part = this.get(j);
                const measure = part.get(i);
                const rendOp = measure.renderOptions;
                rendOp.width = measureNewWidth;
                rendOp.left = currentLeft;
            }
            currentLeft += measureNewWidth;
        }
        return this;
    }
}
stream.Score = Score;

// small Class; a namedtuple in music21p
export class OffsetMap {
    constructor(element, offset, endTime, voiceIndex) {
        this.element = element;
        this.offset = offset;
        this.endTime = endTime;
        this.voiceIndex = voiceIndex;
    }
}
stream.OffsetMap = OffsetMap;
