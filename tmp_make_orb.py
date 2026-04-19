import wave, struct, math
import sys

sample_rate = 44100
duration = 0.25

try:
    f = wave.open('public/assets/audio/sfx/monster_orb.wav', 'w')
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sample_rate)

    for i in range(int(sample_rate * duration)):
        t = i / sample_rate
        
        # 주파수: 500Hz -> 150Hz (노트북 스피커에서도 잘 들리는 대역)
        # 500*t - 0.5 * (350/0.25) * t^2
        phase = 2.0 * math.pi * (500 * t - 700 * t * t)
        
        envelope = 1.0
        if t < 0.02:
            envelope = t / 0.02
        elif t > duration - 0.1:
            envelope = (duration - t) / 0.1
            
        # 순수 사인파(sine)는 모바일/노트북에서 잘 안들리므로, 약간의 각진 소리(배음) 추가
        sine = math.sin(phase)
        sq = 1.0 if sine > 0 else -1.0
        
        # 사인파 70% + 스퀘어파 30% 혼합하여 소리가 명확하게 꽂히도록 함
        sample = (sine * 0.7) + (sq * 0.3)
        
        # 진폭(볼륨)을 32000으로 극대화 (최대치 32767)
        value = int(32000.0 * sample * envelope)
        
        data = struct.pack('<h', value)
        f.writeframesraw(data)

    f.close()
    print("monster_orb.wav loud successfully generated.")
except Exception as e:
    print(e)
    sys.exit(1)
