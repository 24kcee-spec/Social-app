#!/usr/bin/env python3
"""Normalize a local video before upload; originals are never modified.
Usage: prepare-media.py source-video output-directory
Requires ffmpeg + ffprobe. This does not claim to be a deployed adaptive-streaming worker.
"""
import argparse,json,pathlib,subprocess,sys

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path)
    args=parser.parse_args();source=args.source.resolve(strict=True);out=args.output.resolve()
    if not source.is_file() or source.stat().st_size>200*1024*1024:raise RuntimeError('Source must be a file no larger than 200 MB')
    data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)],timeout=30))
    duration=float(data.get('format',{}).get('duration',0))
    if duration<=0 or duration>180:raise RuntimeError('Video must be no longer than 180 seconds')
    out.mkdir(parents=True,exist_ok=True);video=out/'video.mp4';poster=out/'poster.jpg'
    if video.exists() or poster.exists():raise RuntimeError('Output already exists; choose a new directory')
    subprocess.run(['ffmpeg','-nostdin','-n','-i',str(source),'-map','0:v:0','-map','0:a:0?','-vf',"scale='min(1280,iw)':-2",'-c:v','libx264','-preset','medium','-crf','28','-maxrate','750k','-bufsize','1500k','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-movflags','+faststart','-map_metadata','-1',str(video)],check=True,timeout=900)
    subprocess.run(['ffmpeg','-nostdin','-n','-ss','0','-i',str(video),'-frames:v','1','-q:v','3',str(poster)],check=True,timeout=30)
    if video.stat().st_size>20*1024*1024:raise RuntimeError('Output exceeds current upload limit; use lower bitrate or shorter video')
    print(json.dumps({'video':str(video),'poster':str(poster),'sizeBytes':video.stat().st_size,'durationSeconds':duration}))
if __name__=='__main__':
    try:main()
    except (RuntimeError,subprocess.SubprocessError) as error:print(str(error),file=sys.stderr);sys.exit(1)
