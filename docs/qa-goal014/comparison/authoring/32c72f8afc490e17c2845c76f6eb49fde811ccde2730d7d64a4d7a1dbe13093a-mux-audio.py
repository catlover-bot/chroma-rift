from pathlib import Path
import concurrent.futures,datetime,hashlib,importlib.util,json,subprocess,sys
sys.dont_write_bytecode=True
root=Path.cwd();base=root/'.expo/goal014/comparison-final';logs=base/'audio-video-logs';logs.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
spec=importlib.util.spec_from_file_location('audio_stats',root/'scripts/audio/render-chapter-music.py');stats_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(stats_module)
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],text=True))
input_hashes={}
for area in ['04','05']:
 v=base/f'area-{area}-paired-silent.mp4';input_hashes[str(v.relative_to(root))]=sha(v)
 for version in ['before','after']:
  directory=base/version/area
  for relative in ['audio/route-video-aligned.m4a','audio/mix-video-analysis.json','report.json','recording.json','samples.json']:
   f=directory/relative;input_hashes[str(f.relative_to(root))]=sha(f)
def mux(case):
 area,version=case;source=base/f'area-{area}-paired-silent.mp4';directory=base/version/area;audio=directory/'audio/route-video-aligned.m4a';target=base/f'area-{area}-{version}-sound.mp4';original=probe(source);video=next(s for s in original['streams'] if s['codec_type']=='video')
 assert video['width']==780 and video['height']==844 and video['r_frame_rate']=='5/1'
 duration=float(video['duration']);x=0 if version=='before' else 390
 args=['ffmpeg','-y','-v','error','-i',str(source),'-i',str(audio),'-vf',f'crop=390:844:{x}:0','-map','0:v:0','-map','1:a:0','-t',str(duration),'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','copy','-shortest','-movflags','+faststart',str(target)]
 log=logs/f'{area}-{version}.log'
 with log.open('w') as handle:result=subprocess.run(args,stdout=handle,stderr=subprocess.STDOUT)
 assert result.returncode==0,(area,version)
 p=probe(target);v=next(s for s in p['streams'] if s['codec_type']=='video');a=next(s for s in p['streams'] if s['codec_type']=='audio')
 assert v['width']==390 and v['height']==844 and v['nb_frames']==video['nb_frames'] and v['r_frame_rate']=='5/1'
 assert a['codec_name']=='aac' and a['channels']==2 and a['sample_rate']=='44100'
 assert abs(float(v['duration'])-duration)<.001 and abs(float(a['duration'])-duration)<.06
 metrics=stats_module.stats(target);assert metrics['truePeakDbtp']<=-1 and metrics['clippedSamples']==0
 source_report=json.loads((directory/'report.json').read_text());mix_report=json.loads((directory/'audio/mix-video-analysis.json').read_text())
 return {'area':area,'revisionLabel':version,'file':str(target.relative_to(root)),'sha256':sha(target),'bytes':target.stat().st_size,'command':args,'exitCode':result.returncode,'log':str(log.relative_to(root)),'logSha256':sha(log),'video':{k:v[k] for k in ['width','height','r_frame_rate','duration','nb_frames']},'audio':{k:a[k] for k in ['codec_name','sample_rate','channels','duration']},'audioMeasurements':metrics,'sourceReport':str((directory/'report.json').relative_to(root)),'sourceReportSha256':sha(directory/'report.json'),'tapeSha256':source_report['tapeSha256'],'sourceFixtureBoundary':source_report['boundary'],'mixBoundary':mix_report['boundary'],'frameMap':mix_report['frameMap'],'audioReencoded':False,'visualOperation':'Exact left/right390pixel crop of existing780x844 pairedscene movie; no camera/state changes'}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(mux,[(area,version) for area in ['04','05'] for version in ['before','after']]))
for name,expected in input_hashes.items():assert sha(root/name)==expected,'Changed mux input: '+name
for area in ['04','05']:
 values=[x for x in results if x['area']==area];assert values[0]['tapeSha256']==values[1]['tapeSha256'];assert values[0]['frameMap']['sha256']==values[1]['frameMap']['sha256']
report={'schemaVersion':1,'recordedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'boundary':'Paired identical-input controller/actual-scene QA with separate before/after real-owner offline audio reconstructions. Presentation/loaded-player/zero-latency seek are explicit fixtures; no native capture, sample-accurate device scheduling, artistic listening, human continuous play or iPhone performance claim.','inputs':input_hashes,'inputsStableAcrossMux':True,'movies':results,'comparisonLimits':'04usesmatchingposedcameras;05maydivergeafterclearingbecauseoutdoorinputisnowaccepted. Underlying pairedtrace report preserves accepted/refused commands and camera paths. These are fixedtape excerpts from compatible checkpoint setups, not full human play sessions.','DEVICE_ACCEPTANCE':'PENDING','RELEASE_READY':False}
target=base/'audio-video-report.json';target.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'report':str(target),'sha256':sha(target),'movies':[{'file':x['file'],'sha256':x['sha256'],'seconds':x['video']['duration'],'lufs':x['audioMeasurements']['integratedLufs'],'truePeak':x['audioMeasurements']['truePeakDbtp']} for x in results]},indent=2))
