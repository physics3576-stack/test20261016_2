# 지구는 지금 어디서 흔들릴까? 🌍

중학교 과학 수업용 정적 웹 애플리케이션 (React + Vite)

---

## 1. 앱 목적
- **교과 연계**: 중학교 과학(지구과학) ‘지각 변동과 판 구조론’ 단원
- **주요 기능**: 전 세계 실시간 지진 진앙 분포와 판의 경계를 인터랙티브 세계지도(Leaflet) 위에서 비교·탐구하여, 지진대와 판의 경계가 밀접하게 일치함을 시각적으로 탐색합니다.
- **수업 활용**: 학생용 5단계 탐구 활동(경계 예상하기, 예외 찾기, 깊이 비교하기, 규모 조건 바꾸기, 자료의 한계 찾기) 및 교사용 지도 해설 수록.

---

## 2. 데이터 출처 및 API
본 앱은 별도의 백엔드 서버나 데이터베이스 없이 브라우저에서 직접 공개 데이터를 조회하는 100% 정적 웹앱입니다.

1. **지진 관측 데이터**: [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/earthquakes/feed/)
   - 최근 24시간 피드: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson`
   - 최근 7일 피드: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson`
   - 최근 30일 피드: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson`
2. **판 경계선 데이터**: [USGS Tectonic Plate Boundaries](https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer)
   - 원자료 모델: Peter Bird (2003) *An updated digital model of plate boundaries*
3. **지도 배경 타일**: &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors

---

## 3. 자료의 과학적 한계 및 유의사항
- **관측 조건의 한계**: 본 앱은 USGS 관측망에 등록된 **규모 2.5 이상의 지진**만을 표시하며, 전 세계 모든 미소 지진을 빠짐없이 수록한 것이 아닙니다.
- **시간적 스케일의 한계**: 최근 며칠~한 달간 지진이 없었다고 해서 해당 지역이 지진으로부터 안전한 곳은 아니며(지진 공백역 등), 짧은 기간의 관측 분포로 안전도를 단정할 수 없습니다.
- **예측 불가능성**: 판 경계는 참고 모델이며, 지진은 판 내부에서도 발생할 수 있습니다. 본 지도는 미래의 지진을 예측하지 않습니다.
- **시각적 비교식 안내**: 원 크기(반지름)는 화면상 시각적 비교를 위한 제한식(`Math.max(4, Math.min(22, 4 + (mag - 2.5) * 3))`)이며 실제 방출 에너지 비율이나 피해 반경을 뜻하지 않습니다.
- **깊이 색상 구분**: 원의 색상(주황: 천발, 파랑: 중발, 보라: 심발)은 진원의 발생 깊이 구분일 뿐 **위험 등급이 아닙니다**.

---

## 4. 로컬 빌드 및 실행 방법

### 요구 사항
- Node.js 18 이상 및 npm

### 의존성 설치
```bash
npm install
```

### 로컬 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000` 접속

### 프로덕션 정적 빌드
```bash
npm run build
```
빌드 완료 시 최적화된 정적 파일이 `dist/` 폴더에 생성됩니다.

---

## 5. Netlify 배포 설정
본 저장소는 Netlify 배포 설정 파일(`netlify.toml`)이 포함되어 있어 GitHub 연결 시 자동으로 빌드 및 배포됩니다.

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **환경 변수**: 외부 유료 API나 비밀 키, 데이터베이스가 필요하지 않으므로 Netlify 환경 변수 설정 없이 바로 배포할 수 있습니다.
