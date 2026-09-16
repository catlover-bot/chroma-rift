#!/usr/bin/env python3
"""Original deterministic physical-model cues; numpy + ffmpeg, no recordings/samples.
These models suggest surfaces/mechanisms and are not claims of recorded real Foley.
"""
import hashlib,json,math,subprocess,wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/audio/physical';OUT.mkdir(parents=True,exist_ok=True)
SR=24000
rng=np.random.default_rng(140914)
report={'schemaVersion':1,'provenance':'Original deterministic noise/modal physical models; no external sound recordings.','artisticListeningVerified':False,'sampleRate':SR,'sources':{}}
def noise(n,smooth=5):
    raw=rng.normal(0,1,n+smooth-1);return np.convolve(raw,np.ones(smooth)/smooth,'valid')
def impact(t,freqs,decay=.25):
    y=np.zeros(len(t))
    for j,f in enumerate(freqs): y+=np.sin(2*np.pi*f*t+.2*j)*np.exp(-t/(decay/(1+j*.32)))/(1+j*.6)
    return y

def publish(name,y,peak,description,loop=False):
    y=y.astype(np.float64);y-=y.mean();y*=peak/max(np.max(np.abs(y)),1e-10)
    ramp=min(int(.012*SR),len(y)//3);y[:ramp]*=np.linspace(0,1,ramp);y[-ramp:]*=np.linspace(1,0,ramp)
    path=OUT/(name+'.wav')
    with wave.open(str(path),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes((y*32767).astype('<i2').tobytes())
    report['sources'][name]={'description':description,'durationSeconds':len(y)/SR,'loop':loop,'peak':float(np.max(np.abs(y))),'rms':float(np.sqrt(np.mean(y*y))),'dc':float(y.mean()),'clippedSamples':int(np.sum(np.abs(y)>=1)),'loopBoundaryDelta':float(abs(y[-1]-y[0])),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}
for name,dur,desc in [('grip',.65,'Friction take-up, wood flex and short iron contact'),('key',.8,'Two small key teeth followed by a lock bolt'),('ratchet',1.25,'Five uneven ratchet teeth and a low handle return'),('bell',2.1,'Inharmonic struck bronze modes with a decaying air tail'),('isolation',1.9,'Low shutter travel, track rattle and a final seated seal'),('power',1.3,'Relay contacts, brief rising motor spin, stable cutoff'),('step-a',.36,'Heel then sole on hard floor, variation A'),('step-b',.42,'Heel then softer sole on hard floor, variation B'),('cloth-metal',.72,'Cloth friction with two quiet metal articulation contacts')]:
    t=np.arange(round(dur*SR))/SR;y=np.zeros(len(t))
    if name=='grip': y=.36*noise(len(t),13)*np.sin(np.pi*np.minimum(t/.6,1))**2+impact(t,[143,327,861],.12)*.16
    if name=='key':
        for at in [.05,.17,.39]:
            v=np.maximum(0,t-at);y+=np.where(t>=at,impact(v,[1240,2073,3180],.055)*(.25 if at<.3 else .4),0)
        y+=noise(len(t),2)*np.exp(-t*9)*.2
    if name=='ratchet':
        for j,at in enumerate([.06,.22,.43,.66,.94]):
            v=np.maximum(0,t-at);y+=np.where(t>=at,impact(v,[180+j*9,710,1630],.055)*(.4+j*.025)+noise(len(t),3)*np.exp(-v*55)*.2,0)
    if name=='bell': y=impact(t,[523.25,1097,1462,2149,2870],.66)+noise(len(t),2)*np.exp(-t*60)*.14
    if name=='isolation':
        y=noise(len(t),27)*np.sin(np.pi*np.minimum(t/1.4,1))**2*.9+noise(len(t),3)*.06*np.sin(2*np.pi*12*t)**6
        v=np.maximum(0,t-1.42);y+=np.where(t>=1.42,impact(v,[54,113,231],.16)*.75,0)
    if name=='power': y=impact(t,[620,1490],.045)*.5+np.sin(2*np.pi*(61*t+53*t*t))*np.sin(np.pi*t/dur)**2*.12+noise(len(t),7)*np.exp(-t*7)*.14
    if name.startswith('step'):
        y=impact(t,[71,123,263],.065)*.8+noise(len(t),9)*np.exp(-t*19)*.32
        v=np.maximum(0,t-.095);y+=np.where(t>=.095,noise(len(t),17)*np.exp(-v*22)*.5,0)
    if name=='cloth-metal': y=noise(len(t),11)*np.sin(np.pi*t/dur)**2*.9+impact(np.maximum(0,t-.21),[819,1470],.035)*np.where(t>.21,.055,0)
    publish(name,y,.26 if name!='cloth-metal' else .13,desc)
for name,seed,cut,description in [('room-gallery',1,320,'Soft ventilation and spaced timber settling'),('room-vault',2,500,'Narrow damped utility ventilation and pipe ticks'),('room-theatre',3,190,'Curtain air, large room hush and sparse rigging ticks'),('room-mirror',4,650,'Dry enclosed air and small distant metal settling'),('room-control',5,230,'Cabinet ventilation and sparse relay ticks'),('outdoor',6,1700,'Broad slow wind gusts with sparse airy foliage')]:
    rng=np.random.default_rng(1400+seed);t=np.arange(16*SR)/SR
    y=noise(len(t),cut)*(1+.42*np.sin(2*np.pi*t/16)+.18*np.sin(2*np.pi*3*t/16))
    for at in ([3.3,10.6] if name!='outdoor' else [4.1,8.8,13.2]):
        v=np.maximum(0,t-at);y+=np.where(t>=at,noise(len(t),17 if name=='outdoor' else 4)*np.exp(-v*(2 if name=='outdoor' else 18))*.007,0)
    # A 0.5 second quiet seam is deliberate. No abrupt zero-order boundary.
    y[:SR//2]*=np.linspace(0,1,SR//2);y[-SR//2:]*=np.linspace(1,0,SR//2)
    publish(name,y,.13,description,True)
report['rendererSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
report['totalBytes']=sum(x['bytes'] for x in report['sources'].values())
p=ROOT/'docs/qa-goal014/audio/physical-analysis.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(report,indent=2)+'\n');print('Prepared',len(report['sources']),'physical cues/environments;',report['totalBytes'],'bytes')
