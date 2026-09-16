#!/usr/bin/env python3
"""Mix qa-chapter-audio's real-owner command trace offline; never claims native capture.
An optional App scene sample map aligns each area-local simulation timestamp to video.
No normalization is applied: recorded player volumes are retained exactly.
"""
import argparse,importlib.util,json,sys,tempfile
from pathlib import Path
import numpy as np
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('chapter_music_renderer',HERE/'render-chapter-music.py');audio=importlib.util.module_from_spec(spec);spec.loader.exec_module(audio)
SR=44100

def main():
    p=argparse.ArgumentParser();p.add_argument('recording',type=Path);p.add_argument('--frame-map',type=Path);p.add_argument('--asset-root',type=Path,default=ROOT);p.add_argument('--fps',type=float,default=5);p.add_argument('--output',type=Path,default=ROOT/'docs/qa-goal014/audio');p.add_argument('--wav-output',type=Path,help='Optional local PCM24 WAV masters, reconstructed from the same float mix before AAC encoding');args=p.parse_args()
    record=json.loads(args.recording.read_text());args.output.mkdir(parents=True,exist_ok=True)
    waves={}
    for source,asset in record['assetHashes'].items():
        path=args.asset_root/asset['path']
        if audio.digest(path)!=asset['sha256']:raise RuntimeError('Asset changed since extraction: '+source)
        waves[source]=audio.decode(path)
    frames=None
    if args.frame_map:
        mapping=json.loads(args.frame_map.read_text());frames=mapping.get('frames',mapping.get('samples'))
        if not frames:raise RuntimeError('Frame map needs frames or samples with area and simulationSeconds')
    report={'schemaVersion':1,'boundary':'Offline reconstruction of recorded real-owner player commands. Loaded-player/zero-latency seek and accepted presentation are explicit extraction fixtures. No native device audio capture or artistic listening acceptance.',
            'recordingSha256':audio.digest(args.recording),'rendererSha256':audio.digest(Path(__file__)),'artisticListeningVerified':False,
            'sourceHashes':record['sourceHashes'],'defaultPreferences':record['defaultPreferences'],'tracks':{}}
    def event_time(event,kind):
        if frames is None or kind!='route':return event['time']
        candidates=[(i/args.fps,f['simulationSeconds']) for i,f in enumerate(frames) if f['area']==event['area']]
        if not candidates:raise RuntimeError('No video mapping for '+event['area'])
        unique={}
        for video,simulation in candidates:unique.setdefault(simulation,video)
        xp=np.array(sorted(unique));fp=np.array([unique[t] for t in xp])
        return float(np.interp(event['simulationSeconds'],xp,fp))
    for kind in [key for key in ['route','audition','ending'] if key in record]:
        trace=record[kind];events=[dict(e,renderTime=event_time(e,kind)) for e in trace['events']]
        if any(events[i]['renderTime']>events[i+1]['renderTime']+1e-6 for i in range(len(events)-1)):raise RuntimeError('Non-monotonic mapped audio events')
        duration=(len(frames)/args.fps if frames is not None and kind=='route' else trace['durationSeconds'])+.2
        mix=np.zeros((round(duration*SR),2),dtype=np.float32);players={};previous=0
        def render(until):
            nonlocal previous
            end=min(len(mix),round(until*SR));count=end-previous
            if count<=0:return
            for voice in players.values():
                if not voice['playing']:continue
                wave=waves[voice['source']];indices=np.arange(count)+voice['cursor']
                if voice['loop']:mix[previous:end]+=wave[indices%len(wave)]*voice['volume']
                else:
                    valid=indices<len(wave)
                    if np.any(valid):mix[previous:end][valid]+=wave[indices[valid]]*voice['volume']
                voice['cursor']+=count
            previous=end
        for event in events:
            render(event['renderTime']);op=event['operation'];identifier=event.get('id')
            if op=='create':players[identifier]={'source':event['source'],'playing':False,'cursor':0,'volume':0,'loop':False}
            elif identifier is not None:
                if identifier not in players:raise RuntimeError('Command after released/uncreated voice: '+str(event))
                voice=players[identifier]
                if op=='volume':voice['volume']=event['value']
                elif op=='loop':voice['loop']=event['value']
                elif op=='seek':voice['cursor']=round(event['value']*SR)
                elif op=='play':voice['playing']=True
                elif op=='pause':voice['playing']=False
                elif op=='release':del players[identifier]
        render(duration)
        if players:raise RuntimeError('Leaked voice in recording')
        if float(np.max(np.abs(mix)))>=.891:raise RuntimeError('Offline simultaneous mix exceeds -1 dBFS sample peak')
        with tempfile.TemporaryDirectory(prefix='chroma-audio-mix-') as temporary:
            raw=Path(temporary)/'mix.f32';mix.astype('<f4').tofile(raw)
            suffix='route-video-aligned' if frames is not None and kind=='route' else 'controller-route' if kind=='route' else 'ending-intro' if kind=='ending' else 'listening-sequence'
            target=args.output/(suffix+'.m4a')
            audio.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),'-c:a','aac','-b:a','128k','-movflags','+faststart',str(target)])
            wav=None
            if args.wav_output:
                args.wav_output.mkdir(parents=True,exist_ok=True);wav=args.wav_output/(suffix+'.wav')
                audio.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(SR),'-ac','2','-i',str(raw),'-c:a','pcm_s24le',str(wav)])
        measurement=audio.stats(target)
        if measurement['truePeakDbtp']>-1 or measurement['clippedSamples']:raise RuntimeError('Compressed offline mix peak failed')
        measurement.update({'file':str(target.relative_to(ROOT)) if target.is_relative_to(ROOT) else str(target),'maximumOwnedPlayers':trace['maxPlayers'],'activePlayersAtEnd':trace['activePlayersAtEnd'],
          'playedSources':sorted(set(e['source'] for e in events if e['operation']=='play')),'musicStates':trace['states'],
          'boundary':trace.get('boundary','Actual natural-controller route with validated campaign handoffs; no authored extra pursuit trigger.'),'videoAligned':frames is not None and kind=='route'})
        if wav:measurement['wavMaster']={'file':str(wav.relative_to(ROOT)) if wav.is_relative_to(ROOT) else str(wav),'sha256':audio.digest(wav),'bytes':wav.stat().st_size,'format':'PCM24 stereo 44.1 kHz','source':'Same offline float mix, quantized to 24-bit PCM before AAC; not decoded from the AAC file or captured from a device.'}
        report['tracks'][kind]=measurement;print(kind,measurement['durationSeconds'],measurement['integratedLufs'],measurement['truePeakDbtp'],flush=True)
    if args.frame_map:report['frameMap']={'sha256':audio.digest(args.frame_map),'fps':args.fps,'frames':len(frames),'duplicateTimestampPolicy':'Earliest visual frame anchors each area-local simulation time; intervening times are linearly mapped. Distinct committed-command evidence frames may share one simulation time.','timingBoundary':'Fixed-rate scene sampling and held command evidence expand replay time. This is a derived offline alignment, not native audio/video capture or sample-accurate device scheduling.'}
    report['limits']='Native buffering, Expo/iOS route changes, interruption behavior, final iPhone speaker balance and human artistic acceptance are not measured. Output retains default player volumes; no audition normalization.'
    report['DEVICE_ACCEPTANCE']='PENDING';report['RELEASE_READY']=False
    (args.output/('mix-video-analysis.json' if args.frame_map else 'mix-analysis.json')).write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
if __name__=='__main__':main()
