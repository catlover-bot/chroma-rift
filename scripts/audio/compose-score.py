from pathlib import Path
import json

OUT = Path(__file__).parent
THEME = [62, 69, 64, 65]  # D4, A4, E4, F4: the unresolved closing-time call.
tracks = {}

def piece(name, bpm, duration, form, notes, gaps):
    tracks[name] = {'bpm': bpm, 'durationSeconds': duration, 'meter': '4/4',
                    'form': form, 'phraseRestBars': gaps, 'notes': sorted(notes, key=lambda n: n['beat'])}

def note(notes, instrument, beat, midi, beats, velocity=.6, pan=0):
    notes.append({'instrument': instrument, 'beat': round(beat, 4), 'midi': midi,
                  'durationBeats': beats, 'velocity': velocity, 'pan': pan})

def motif(notes, beat, pitches=THEME, instrument='piano', velocity=.58, stretch=1):
    for i, (offset, pitch, gate) in enumerate(zip([0, 1.5, 3, 5.25], pitches, [1.3, 1.2, 1.7, 1.4])):
        note(notes, instrument, beat + offset*stretch, pitch, gate*stretch,
             velocity * [1, .81, .9, .76][i], -.12 if instrument == 'piano' else .18)

def bass(notes, beat, midi, beats, velocity=.4):
    note(notes, 'cello', beat, midi, beats, velocity, -.15)

# 16 bars. The last bar is a real breath, not a constant bed.
n=[]
for b, chord, variation, v in [(0,38,THEME,.6),(8,34,[62,69,65,64],.53),
                             (16,41,THEME,.64),(24,36,[60,67,62,64],.52),
                             (32,34,[65,69,67,62],.53),(40,36,[64,67,62,60],.47),
                             (48,38,THEME,.51)]:
    motif(n,b,variation,velocity=v)
    if b>=16: bass(n,b+.35,chord,5,.32)
    if b in [24,40,48]: note(n,'harp',b+3.75,chord+24,2,.25,.18)
note(n,'metal',56,74,3,.12,.12)
piece('title_theme',72,54,'A: solo call / A2: cello answer / B: displaced harmony / A3: thinning return',n,[3,7,11,15])

# Five four-bar rooms, all variations of the same theme; 20 bars at 56 BPM.
n=[]
for section,(root,pitches,timbre) in enumerate([
    (38,THEME,'piano'),(34,[62,65,64,69],'harp'),(41,[65,72,67,69],'piano'),
    (36,[60,67,62,65],'harp'),(38,[62,69,64,62],'piano')]):
    b=section*16
    motif(n,b+1,pitches,timbre,.4)
    bass(n,b+.2,root,5.5,.23)
    note(n,'pizz',b+8,root,1,.2,-.1)
    note(n,'harp',b+9.5,root+19,2,.24,.15)
    if section%2==0: note(n,'metal',b+10.5,pitches[2]+12,1.5,.075,.1)
piece('exploration',56,88,'Five rooms: statement / plucked answer / high fragment / open fifth / tonic rest',n,[3,7,11,15,19])

# 3/4 unease: 16 bars, pulse fragments separated by full-bar gaps.
n=[]
for section in range(4):
    b=section*12
    bass(n,b,38 if section%2==0 else 39,4.8,.28)
    for i,offset in enumerate([.5,2,4.5,7]):
        note(n,'pizz',b+offset,[38,45,40,41][i] + (12 if section==2 else 0),.55,.31 + .025*i,-.08)
    motif(n,b+1,[62,69,63 if section%2 else 64,65], 'metal' if section==2 else 'piano', .3, .85)
piece('suspicion',54,56,'Four three-beat phrases: question / semitone shadow / metal echo / withdrawal',n,[3,7,11,15])
tracks['suspicion']['meter']='3/4'

# Pulse is performed pizzicato/cello, not a drum loop or a held sine wave.
n=[]
for section,root in enumerate([38,34,41,36]):
    b=section*16
    for beat in range(14):
        note(n,'pizz',b+beat*.999,root+(7 if beat%4==2 else 0),.36,
             .5 if beat%4==0 else .28+(.1 if beat%2 else 0),-.13)
        if beat%2==1: note(n,'metal',b+beat+.52,74+(1 if section==2 else 0),.38,.085,.1)
    motif(n,b+1,[x+(12 if section==2 else 0) for x in THEME],velocity=.45,stretch=.8)
    bass(n,b+8,root,3.4,.32)
piece('pursuit',108,38,'Four compressed cells with off-beat metal; two-beat releases keep footsteps legible',n,[3.5,7.5,11.5,15.5])

n=[]
motif(n,0,[62,69,66,62],velocity=.57,stretch=.85)
bass(n,.35,38,4.6,.3)
note(n,'harp',1.9,57,3,.31,.16)
note(n,'harp',2.15,66,3,.23,.16)
note(n,'piano',5.1,50,1.2,.32,-.12)
piece('release',60,10,'A short answered call, open fifth and long air after the cadence',n,[1.6])

n=[]
for b,root,pitches,v in [(0,38,THEME,.42),(8,43,[62,69,67,64],.48),
                        (16,47,[66,73,69,67],.46),(24,45,[64,69,66,64],.47),
                        (32,43,[67,74,69,66],.5),(40,45,[64,69,66,62],.47),
                        (48,38,[62,69,66,62],.44)]:
    motif(n,b,pitches,velocity=v)
    bass(n,b+.4,root,5.8,.3)
    for offset,pitch in [(1.1,root+12),(3.1,root+19)]:note(n,'harp',b+offset,pitch,2,.24,.18)
for offset,pitch,vel in [(56,50,.35),(56.12,57,.28),(56.24,66,.24),(58,62,.37)]:
    note(n,'piano',offset,pitch,3.7,vel,-.1)
note(n,'harp',58.3,74,2.1,.2,.15)
piece('chapter_end',68,62,'Unanswered title / widening daylight / D-major answer / decaying final chord / silence',n,[15])

score={'schemaVersion':1,'title':'CHROMA RIFT — 最後の退館者',
       'composition':'Original Goal014 composition; no borrowed melody, MIDI or musical loops.',
       'theme':{'midi':THEME,'notes':['D4','A4','E4','F4'],'endingAnswer':[62,69,66,62]},
       'render':{'sampleRate':44100,'channels':2,'targetIntegratedLufs':-22,'truePeakCeilingDbtp':-2,
                 'sampleSet':'instrument-sources.json','reverb':'offline short asymmetric tapped room; no phase-sensitive runtime stems'},
       'artisticListeningVerified':False,'tracks':tracks}
(OUT/'chapter-one-score.json').write_text(json.dumps(score,ensure_ascii=False,indent=2)+'\n')
print({name:{'duration':track['durationSeconds'],'notes':len(track['notes'])} for name,track in tracks.items()})
