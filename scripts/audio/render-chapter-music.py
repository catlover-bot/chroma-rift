#!/usr/bin/env python3
"""Render the editable original score. Python + numpy + ffmpeg; no app dependency.
Sample downloads are pinned and hash checked, cached outside shipped assets.
Usage: python scripts/audio/render-chapter-music.py --cache /tmp/chroma-goal014-music/samples
"""
import argparse, hashlib, json, math, re, shutil, subprocess, tempfile, urllib.request
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SR = 44100

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def decode(path):
    raw=run(['ffmpeg','-v','error','-i',str(path),'-f','f32le','-ac','2','-ar',str(SR),'-']).stdout
    return np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
def stats(path):
    result=run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-22:TP=-2:LRA=11:print_format=json','-f','null','-'])
    measurement=json.loads(re.findall(r'\{[^{}]*\}',result.stderr.decode())[-1])
    a=decode(path); mono=a.mean(axis=1)
    stereo_rms=float(np.sqrt(np.mean(a*a))); mono_rms=float(np.sqrt(np.mean(mono*mono)))
    return {'integratedLufs':float(measurement['input_i']),'truePeakDbtp':float(measurement['input_tp']),
            'loudnessRangeLu':float(measurement['input_lra']),'durationSeconds':len(a)/SR,
            'samplePeak':float(np.max(np.abs(a))), 'clippedSamples':int(np.sum(np.abs(a)>=1)),
            'dcMean':a.mean(axis=0).tolist(),'monoRmsRelativeDb':20*math.log10(max(mono_rms,1e-12)/max(stereo_rms,1e-12)),
            'channelCorrelation':float(np.corrcoef(a.T)[0,1]),
            'finalHalfSecondPeak':float(np.max(np.abs(a[-SR//2:]))),
            'sha256':digest(path),'bytes':path.stat().st_size}
def main():
    p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,default=Path(tempfile.gettempdir())/'chroma-vsco-small');p.add_argument('--output',type=Path,default=ROOT/'assets/audio/music');a=p.parse_args()
    a.cache.mkdir(parents=True,exist_ok=True);a.output.mkdir(parents=True,exist_ok=True)
    score=json.loads((HERE/'chapter-one-score.json').read_text());sources=json.loads((HERE/'instrument-sources.json').read_text()); samples={}
    for source in sources['samples']:
        path=a.cache/(source['id']+'.wav')
        if not path.exists(): urllib.request.urlretrieve(source['url'],path)
        if digest(path)!=source['sha256']: raise RuntimeError('Sample hash mismatch: '+str(path))
        wave=decode(path); wave/=max(float(np.max(np.abs(wave))),.001)
        samples[source['id']]=(source['rootMidi'],wave)
    report={'schemaVersion':1,'scoreSha256':digest(HERE/'chapter-one-score.json'),'rendererSha256':digest(Path(__file__)),
      'sourceManifestSha256':digest(HERE/'instrument-sources.json'),'codec':'AAC LC, stereo, 44100 Hz, 112 kbit/s',
      'artisticListeningVerified':False,'status':'technical mix candidate; headphone/speaker and device listening pending','tracks':{}}
    with tempfile.TemporaryDirectory(prefix='chroma-music-render-') as temporary:
      for name,piece in score['tracks'].items():
        mix=np.zeros((round(SR*piece['durationSeconds']),2),dtype=np.float32); seconds=60/piece['bpm']
        for n in piece['notes']:
            kind=n['instrument']; candidates=[key for key in samples if key.startswith(kind)]
            key=min(candidates,key=lambda key:abs(samples[key][0]-n['midi'])); root,wave=samples[key]
            ratio=2**((n['midi']-root)/12); gate=n['durationBeats']*seconds
            release={'piano':.65,'cello':.65,'pizz':.22,'harp':.75,'metal':.48}[kind]
            count=min(int((gate+release)*SR),int((len(wave)-1)/ratio)); pos=np.arange(count)*ratio
            note=np.column_stack([np.interp(pos,np.arange(len(wave)),wave[:,ch]) for ch in range(2)])
            # Retain natural sample attack, gate sustained instruments and let acoustic tails breathe.
            env=np.ones(count); attack=min(count,int(SR*(.055 if kind=='cello' else .006)));env[:attack]=np.linspace(0,1,attack)
            tail=min(count,int(SR*release)); env[-tail:]*=np.linspace(1,0,tail)**1.7
            tone_gain={'piano':.65,'cello':.23,'pizz':.50,'harp':.42,'metal':.20}[kind]
            # Narrow original stereo and use static balance; no unsupported runtime positional API.
            mid=note.mean(axis=1);note=.32*note+.68*mid[:,None]
            pan=n['pan']; note*=np.array([1-max(0,pan)*.4,1+min(0,pan)*.4])
            note*=env[:,None]*n['velocity']*tone_gain
            start=round(n['beat']*seconds*SR);end=min(len(mix),start+len(note))
            if end>start: mix[start:end]+=note[:end-start]
        dry=mix.copy()
        for delay,gain in [(.043,.095),(.079,.07),(.137,.044),(.211,.023)]:
            offset=round(delay*SR);mix[offset:]+=dry[:-offset,::-1]*gain
        # Real silent lead/tail allows finite ending breath and quiet loop seams.
        fade=min(SR//3,len(mix));mix[:441]*=np.linspace(0,1,441)[:,None];mix[-fade:]*=np.linspace(1,0,fade)[:,None]
        raw=Path(temporary)/(name+'.f32');mix.astype('<f4').tofile(raw)
        args=['ffmpeg','-y','-hide_banner','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw)]
        measured=run(args+['-af','loudnorm=I=-22:TP=-2:LRA=11:print_format=json','-f','null','-'])
        m=json.loads(re.findall(r'\{[^{}]*\}',measured.stderr.decode())[-1])
        filt='loudnorm=I=-22:TP=-2:LRA=11:linear=true:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}'.format(**m)
        output=a.output/(name+'.m4a');run(args+['-af',filt,'-ar',str(SR),'-c:a','aac','-b:a','112k','-movflags','+faststart',str(output)])
        info=stats(output);info.update({'noteCount':len(piece['notes']),'form':piece['form'],'phraseRestBars':piece['phraseRestBars']})
        if not (-24<=info['integratedLufs']<=-20 and info['truePeakDbtp']<=-1 and info['clippedSamples']==0): raise RuntimeError('Mix gate failed: '+name+str(info))
        report['tracks'][name]=info;print(name,info['integratedLufs'],info['truePeakDbtp'],flush=True)
    report['totalCompressedBytes']=sum(t['bytes'] for t in report['tracks'].values())
    report['limits']='File loudness/mono measurements do not establish device audibility, final simultaneous mix peak, accessibility or hearing safety.'
    out=ROOT/'docs/qa-goal014/audio/music-analysis.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
if __name__=='__main__': main()
