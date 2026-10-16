/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import {
  Globe,
  MapPin,
  Compass,
  RefreshCw,
  ExternalLink,
  Layers,
  AlertTriangle,
  Info,
  Clock,
  X,
  BookOpen,
  Filter,
  RotateCcw,
  ShieldAlert,
  GitCommit,
  ListOrdered,
  Activity,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  GraduationCap,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

type PeriodOption = '24h' | '7d' | '30d';

const PERIOD_CONFIG: Record<
  PeriodOption,
  { label: string; url: string; titleLabel: string; shortDesc: string }
> = {
  '24h': {
    label: '최근 24시간',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    titleLabel: 'USGS 최근 24시간 · 규모 2.5 이상 자료',
    shortDesc: '최근 24시간 동안 관측된 지진',
  },
  '7d': {
    label: '최근 7일',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    titleLabel: 'USGS 최근 7일 · 규모 2.5 이상 자료',
    shortDesc: '최근 7일간 관측된 지진 (기본)',
  },
  '30d': {
    label: '최근 30일',
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson',
    titleLabel: 'USGS 최근 30일 · 규모 2.5 이상 자료',
    shortDesc: '최근 30일간 관측된 지진',
  },
};

type DepthFilterOption = 'all' | 'shallow' | 'intermediate' | 'deep' | 'unknown';

const DEPTH_FILTER_OPTIONS: { value: DepthFilterOption; label: string; desc: string }[] = [
  { value: 'all', label: '깊이 전체', desc: '모든 깊이' },
  { value: 'shallow', label: '70km 미만', desc: '천발 지진' },
  { value: 'intermediate', label: '70~300km 미만', desc: '중발 지진' },
  { value: 'deep', label: '300km 이상', desc: '심발 지진' },
  { value: 'unknown', label: '정보 없음', desc: '깊이 결측' },
];

const MAG_OPTIONS = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];

type PlateBoundaryCategory = 'convergent' | 'divergent' | 'transform' | 'other';

interface PlateBoundaryConfig {
  category: PlateBoundaryCategory;
  rawLabel: string;
  koreanName: string;
  color: string;
  dashArray?: string;
  lineDesc: string;
  weight: number;
}

function classifyPlateBoundary(rawLabel: string | null | undefined): PlateBoundaryConfig {
  const normalized = (rawLabel || '').trim().toLowerCase();
  if (normalized === 'convergent boundary') {
    return {
      category: 'convergent',
      rawLabel: 'Convergent Boundary',
      koreanName: '수렴 경계',
      color: '#b91c1c',
      lineDesc: '짙은 붉은 실선',
      weight: 2.5,
    };
  }
  if (normalized === 'divergent boundary') {
    return {
      category: 'divergent',
      rawLabel: 'Divergent Boundary',
      koreanName: '발산 경계',
      color: '#0f766e',
      dashArray: '10, 6',
      lineDesc: '짙은 청록색 긴 점선',
      weight: 2.5,
    };
  }
  if (normalized === 'transform boundary') {
    return {
      category: 'transform',
      rawLabel: 'Transform Boundary',
      koreanName: '보존 경계',
      color: '#374151',
      dashArray: '4, 4',
      lineDesc: '짙은 회색 짧은 점선',
      weight: 2.5,
    };
  }
  return {
    category: 'other',
    rawLabel: rawLabel || 'Other',
    koreanName: '기타·미분류 경계',
    color: '#9ca3af',
    dashArray: '3, 5',
    lineDesc: '옅은 회색 점선',
    weight: 2,
  };
}

interface PlateFeature {
  type: 'Feature';
  properties: {
    NAME?: string | null;
    LABEL?: string | null;
  };
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: any;
  };
}

interface EarthquakeProperties {
  mag: number | null;
  place: string | null;
  time: number | null;
  updated: number | null;
  tz: number | null;
  url: string | null;
  detail: string | null;
  felt: number | null;
  cdi: number | null;
  mmi: number | null;
  alert: string | null;
  status: string | null;
  tsunami: number | null;
  sig: number | null;
  net: string | null;
  code: string | null;
  ids: string | null;
  sources: string | null;
  types: string | null;
  nst: number | null;
  dmin: number | null;
  rms: number | null;
  gap: number | null;
  magType: string | null;
  type: string;
  title: string | null;
}

interface EarthquakeFeature {
  type: 'Feature';
  properties: EarthquakeProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number, number];
  };
  id: string;
}

interface USGSGeoJSONResponse {
  type: 'FeatureCollection';
  metadata: {
    generated: number;
    url: string;
    title: string;
    status: number;
    api: string;
    count: number;
  };
  features: EarthquakeFeature[];
}

export interface SelectedEarthquakeInfo {
  id: string;
  place: string | null;
  mag: number | null;
  magType: string | null;
  depth: number | null;
  time: number | null;
  url: string | null;
  lat: number;
  lng: number;
  depthCategoryText: string;
  hasNegativeDepth: boolean;
}

export interface SelectedPlateInfo {
  name: string | null;
  koreanName: string;
  rawLabel: string;
  lineDesc: string;
  color: string;
}

interface DepthCategory {
  label: string;
  stageName: string;
  fillColor: string;
  borderColor: string;
}

function getDepthCategory(depth: number | null | undefined): DepthCategory {
  if (depth === null || depth === undefined || typeof depth !== 'number' || isNaN(depth)) {
    return {
      label: '깊이 정보 없음',
      stageName: '미기재',
      fillColor: '#94a3b8',
      borderColor: '#475569',
    };
  }
  if (depth < 70) {
    return {
      label: '70km 미만',
      stageName: '천발 지진',
      fillColor: '#f97316',
      borderColor: '#c2410c',
    };
  }
  if (depth < 300) {
    return {
      label: '70km 이상 300km 미만',
      stageName: '중발 지진',
      fillColor: '#2563eb',
      borderColor: '#1d4ed8',
    };
  }
  return {
    label: '300km 이상',
    stageName: '심발 지진',
    fillColor: '#9333ea',
    borderColor: '#7e22ce',
  };
}

function getRadiusByMagnitude(mag: number | null | undefined): number {
  if (mag === null || mag === undefined || typeof mag !== 'number' || isNaN(mag)) {
    return 4;
  }
  return Math.max(4, Math.min(22, 4 + (mag - 2.5) * 3));
}

function formatKST(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || isNaN(timestamp)) {
    return '시각 정보 없음';
  }
  try {
    const date = new Date(timestamp);
    const formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${formatter.format(date)} (한국 시간 KST)`;
  } catch {
    return '시각 변환 오류';
  }
}

function getValidUSGSUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && parsed.hostname === 'earthquake.usgs.gov') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function isValidCoordinate(coords: unknown): coords is [number, number, number | null] {
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || typeof lat !== 'number') return false;
  if (isNaN(lng) || isNaN(lat)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

interface CacheItem {
  data: USGSGeoJSONResponse;
  fetchedTime: number;
}

type SortOrder = 'latest' | 'magnitude';
type MobileViewMode = 'all' | 'map' | 'list';

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const earthquakeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const plateBoundariesLayerRef = useRef<L.GeoJSON | null>(null);
  const markerMapRef = useRef<Map<string, L.CircleMarker>>(new Map());

  // 지도 상태
  const [currentZoom, setCurrentZoom] = useState<number>(2);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20, lng: 0 });

  // 지진 필터 상태
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('7d');
  const [minMagnitude, setMinMagnitude] = useState<number>(2.5);
  const [selectedDepthFilter, setSelectedDepthFilter] = useState<DepthFilterOption>('all');

  // 지진 데이터 통신 상태
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentRawData, setCurrentRawData] = useState<USGSGeoJSONResponse | null>(null);
  const [feedFetchedTime, setFeedFetchedTime] = useState<number | null>(null);

  // 판 경계 레이어 상태 (기본값: 끄기)
  const [showPlateBoundaries, setShowPlateBoundaries] = useState<boolean>(false);
  const [plateFetchStatus, setPlateFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [plateErrorMessage, setPlateErrorMessage] = useState<string | null>(null);
  const [plateFeatureCount, setPlateFeatureCount] = useState<number>(0);
  const [visiblePlateCategories, setVisiblePlateCategories] = useState<Record<PlateBoundaryCategory, boolean>>({
    convergent: true,
    divergent: true,
    transform: true,
    other: true,
  });

  // 선택된 항목 상태 (지진 또는 판 경계)
  const [selectedEarthquake, setSelectedEarthquake] = useState<SelectedEarthquakeInfo | null>(null);
  const [selectedPlate, setSelectedPlate] = useState<SelectedPlateInfo | null>(null);

  // 목록 정렬 및 페이지네이션 상태
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 12;

  // 모바일 뷰 모드 ('all' | 'map' | 'list')
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('all');

  // ‘수업에서 탐구하기’ 교사용 해설 펼치기 상태 관리 (활동 번호 1~5)
  const [expandedTeacherGuides, setExpandedTeacherGuides] = useState<Record<number, boolean>>({});

  const toggleTeacherGuide = (activityNum: number) => {
    setExpandedTeacherGuides((prev) => ({
      ...prev,
      [activityNum]: !prev[activityNum],
    }));
  };

  // 지진 피드 캐시 & 경쟁 상태 방지 ref
  const cacheRef = useRef<Partial<Record<PeriodOption, CacheItem>>>({});
  const requestIdRef = useRef<number>(0);

  // 판 경계 GeoJSON 캐시
  const cachedPlateFeaturesRef = useRef<PlateFeature[] | null>(null);

  // 지도 초기화 (1회)
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      zoomSnap: 1,
      zoomDelta: 1,
      attributionControl: true,
      zoomControl: false,
    });

    map.createPane('plateBoundariesPane');
    map.getPane('plateBoundariesPane')!.style.zIndex = '350';

    map.createPane('earthquakePane');
    map.getPane('earthquakePane')!.style.zIndex = '450';

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);

    const earthquakeLayer = L.layerGroup([], { pane: 'earthquakePane' }).addTo(map);
    earthquakeLayerGroupRef.current = earthquakeLayer;
    mapInstanceRef.current = map;

    const updateMapState = () => {
      setCurrentZoom(map.getZoom());
      const c = map.getCenter();
      setMapCenter({
        lat: Math.round(c.lat * 10) / 10,
        lng: Math.round(c.lng * 10) / 10,
      });
    };

    map.on('zoomend', updateMapState);
    map.on('moveend', updateMapState);

    const handleWheel = (e: WheelEvent) => {
      const zoom = map.getZoom();
      const minZ = map.getMinZoom();
      const zoomSnap = 1;

      if (e.deltaY > 0 && zoom - zoomSnap < minZ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    container.addEventListener('wheel', handleWheel, { capture: true, passive: false });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      container.removeEventListener('wheel', handleWheel, { capture: true });
      map.off('zoomend', updateMapState);
      map.off('moveend', updateMapState);
      map.remove();
      mapInstanceRef.current = null;
      earthquakeLayerGroupRef.current = null;
      plateBoundariesLayerRef.current = null;
    };
  }, []);

  // 지진 피드 데이터 로드
  const loadPeriodData = useCallback(async (period: PeriodOption, forceRefresh = false) => {
    if (!forceRefresh && cacheRef.current[period]) {
      const cached = cacheRef.current[period]!;
      setCurrentRawData(cached.data);
      setFeedFetchedTime(cached.fetchedTime);
      setFetchStatus('success');
      setErrorMessage(null);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    setFetchStatus('loading');
    setErrorMessage(null);

    try {
      const response = await fetch(PERIOD_CONFIG[period].url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || '서버 통신 실패'}`);
      }
      const data: USGSGeoJSONResponse = await response.json();

      if (currentRequestId !== requestIdRef.current) return;

      const now = Date.now();
      cacheRef.current[period] = { data, fetchedTime: now };
      setCurrentRawData(data);
      setFeedFetchedTime(now);
      setFetchStatus('success');
    } catch (err: unknown) {
      if (currentRequestId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : '네트워크 요청에 실패했습니다.';
      setErrorMessage(msg);
      setFetchStatus('error');
    }
  }, []);

  useEffect(() => {
    loadPeriodData(selectedPeriod, false);
  }, [selectedPeriod, loadPeriodData]);

  const handleRefresh = () => {
    if (fetchStatus === 'loading') return;
    loadPeriodData(selectedPeriod, true);
  };

  // 판 경계 데이터 로드 (페이지네이션)
  const fetchAllPlateBoundaries = useCallback(async () => {
    if (cachedPlateFeaturesRef.current) {
      return cachedPlateFeaturesRef.current;
    }

    setPlateFetchStatus('loading');
    setPlateErrorMessage(null);

    const baseUrl =
      'https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer/1/query?where=1%3D1&outFields=NAME%2CLABEL&outSR=4326&f=geojson';
    const pageSize = 1000;
    let offset = 0;
    let allFeatures: PlateFeature[] = [];
    let hasMore = true;

    try {
      while (hasMore) {
        const queryUrl = `${baseUrl}&resultOffset=${offset}&resultRecordCount=${pageSize}`;
        const response = await fetch(queryUrl);
        if (!response.ok) {
          throw new Error(`판 경계 서버 응답 실패 (HTTP ${response.status})`);
        }
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'ArcGIS 서비스 오류 발생');
        }

        if (!data.features || !Array.isArray(data.features)) {
          break;
        }

        allFeatures = allFeatures.concat(data.features);

        if (data.exceededTransferLimit || data.features.length === pageSize) {
          offset += data.features.length;
        } else {
          hasMore = false;
        }
      }

      cachedPlateFeaturesRef.current = allFeatures;
      setPlateFeatureCount(allFeatures.length);
      setPlateFetchStatus('success');
      return allFeatures;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '판 경계 데이터를 불러오지 못했습니다.';
      setPlateErrorMessage(msg);
      setPlateFetchStatus('error');
      return null;
    }
  }, []);

  // 판 경계 레이어 표시/숨김
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!showPlateBoundaries) {
      if (plateBoundariesLayerRef.current) {
        map.removeLayer(plateBoundariesLayerRef.current);
        plateBoundariesLayerRef.current = null;
      }
      return;
    }

    let isCancelled = false;

    (async () => {
      let features = cachedPlateFeaturesRef.current;
      if (!features) {
        features = await fetchAllPlateBoundaries();
      }
      if (isCancelled || !features || !mapInstanceRef.current) return;

      if (plateBoundariesLayerRef.current) {
        map.removeLayer(plateBoundariesLayerRef.current);
        plateBoundariesLayerRef.current = null;
      }

      const visibleFeatures = features.filter((f) => {
        const conf = classifyPlateBoundary(f.properties?.LABEL);
        return visiblePlateCategories[conf.category];
      });

      const geoJsonLayer = L.geoJSON(
        {
          type: 'FeatureCollection',
          features: visibleFeatures as any,
        } as unknown as GeoJSON.FeatureCollection,
        {
          pane: 'plateBoundariesPane',
          style: (feature) => {
            const conf = classifyPlateBoundary(feature?.properties?.LABEL);
            return {
              color: conf.color,
              weight: conf.weight,
              opacity: 0.9,
              dashArray: conf.dashArray,
              lineCap: 'round',
              lineJoin: 'round',
            };
          },
          onEachFeature: (feature, layer) => {
            const conf = classifyPlateBoundary(feature?.properties?.LABEL);
            const rawName = feature.properties?.NAME ? String(feature.properties.NAME).trim() : null;

            const popupDiv = document.createElement('div');
            popupDiv.className = 'p-1 text-slate-800 text-xs space-y-1.5 min-w-[200px] max-w-[270px] font-sans';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'font-bold text-slate-900 border-b border-slate-200 pb-1 flex items-center justify-between';
            headerDiv.textContent = '판 경계선 정보';

            const badgeSpan = document.createElement('span');
            badgeSpan.className = 'text-[10px] font-medium px-1.5 py-0.5 rounded text-white';
            badgeSpan.style.backgroundColor = conf.color;
            badgeSpan.textContent = conf.koreanName;
            headerDiv.appendChild(badgeSpan);
            popupDiv.appendChild(headerDiv);

            const nameDiv = document.createElement('div');
            nameDiv.className = 'text-xs text-slate-800';
            const nameLabel = document.createElement('span');
            nameLabel.className = 'text-slate-500 mr-1';
            nameLabel.textContent = '원문 NAME:';
            nameDiv.appendChild(nameLabel);
            const nameVal = document.createElement('strong');
            nameVal.textContent = rawName || '명칭 미기재 (원자료 없음)';
            nameDiv.appendChild(nameVal);
            popupDiv.appendChild(nameDiv);

            const typeDiv = document.createElement('div');
            typeDiv.className = 'text-xs text-slate-700';
            typeDiv.textContent = `경계 종류: ${conf.koreanName} (${conf.rawLabel})`;
            popupDiv.appendChild(typeDiv);

            const styleDiv = document.createElement('div');
            styleDiv.className = 'text-[11px] text-slate-500';
            styleDiv.textContent = `지도 선 표현: ${conf.lineDesc}`;
            popupDiv.appendChild(styleDiv);

            layer.bindPopup(popupDiv);

            layer.on('click', () => {
              setSelectedPlate({
                name: rawName,
                koreanName: conf.koreanName,
                rawLabel: conf.rawLabel,
                lineDesc: conf.lineDesc,
                color: conf.color,
              });
            });
          },
        }
      );

      geoJsonLayer.addTo(map);
      plateBoundariesLayerRef.current = geoJsonLayer;
    })();

    return () => {
      isCancelled = true;
    };
  }, [showPlateBoundaries, visiblePlateCategories, fetchAllPlateBoundaries]);

  // 지진 필터링 계산
  const { filteredFeatures, rawTotalCount, excludedCoordCount } = useMemo(() => {
    if (!currentRawData?.features || !Array.isArray(currentRawData.features)) {
      return {
        filteredFeatures: [],
        rawTotalCount: 0,
        excludedCoordCount: 0,
      };
    }

    let excluded = 0;
    const filtered: EarthquakeFeature[] = [];
    let earthquakeTypeCount = 0;

    for (const f of currentRawData.features) {
      if (f?.properties?.type !== 'earthquake') {
        continue;
      }
      earthquakeTypeCount++;

      const coords = f?.geometry?.coordinates;
      if (!isValidCoordinate(coords)) {
        excluded++;
        continue;
      }

      const mag = f.properties.mag;
      const [, , rawDepth] = coords;

      if (mag !== null && mag !== undefined && typeof mag === 'number' && !isNaN(mag)) {
        if (mag < minMagnitude) continue;
      } else {
        if (minMagnitude > 2.5) continue;
      }

      const hasValidDepth =
        rawDepth !== null && rawDepth !== undefined && typeof rawDepth === 'number' && !isNaN(rawDepth);

      if (selectedDepthFilter === 'shallow') {
        if (!hasValidDepth || rawDepth >= 70) continue;
      } else if (selectedDepthFilter === 'intermediate') {
        if (!hasValidDepth || rawDepth < 70 || rawDepth >= 300) continue;
      } else if (selectedDepthFilter === 'deep') {
        if (!hasValidDepth || rawDepth < 300) continue;
      } else if (selectedDepthFilter === 'unknown') {
        if (hasValidDepth) continue;
      }

      filtered.push(f);
    }

    return {
      filteredFeatures: filtered,
      rawTotalCount: earthquakeTypeCount,
      excludedCoordCount: excluded,
    };
  }, [currentRawData, minMagnitude, selectedDepthFilter]);

  // 요약 통계 계산
  const summaryStats = useMemo(() => {
    let shallowCount = 0;
    let intermediateCount = 0;
    let deepCount = 0;
    let missingDepthCount = 0;
    let missingMagCount = 0;
    const validMags: number[] = [];

    for (const f of filteredFeatures) {
      const mag = f.properties.mag;
      if (mag !== null && mag !== undefined && typeof mag === 'number' && !isNaN(mag)) {
        validMags.push(mag);
      } else {
        missingMagCount++;
      }

      const rawDepth = f.geometry.coordinates[2];
      if (rawDepth !== null && rawDepth !== undefined && typeof rawDepth === 'number' && !isNaN(rawDepth)) {
        if (rawDepth < 70) shallowCount++;
        else if (rawDepth < 300) intermediateCount++;
        else deepCount++;
      } else {
        missingDepthCount++;
      }
    }

    const maxMag = validMags.length > 0 ? Math.max(...validMags) : null;

    return {
      total: filteredFeatures.length,
      maxMag,
      shallowCount,
      intermediateCount,
      deepCount,
      missingDepthCount,
      missingMagCount,
    };
  }, [filteredFeatures]);

  // 목록 정렬 계산
  const sortedFeatures = useMemo(() => {
    const list = [...filteredFeatures];
    if (sortOrder === 'latest') {
      list.sort((a, b) => (b.properties.time ?? 0) - (a.properties.time ?? 0));
    } else {
      list.sort((a, b) => {
        const magA = a.properties.mag ?? -999;
        const magB = b.properties.mag ?? -999;
        if (magB !== magA) return magB - magA;
        return (b.properties.time ?? 0) - (a.properties.time ?? 0);
      });
    }
    return list;
  }, [filteredFeatures, sortOrder]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPeriod, minMagnitude, selectedDepthFilter, sortOrder]);

  const totalPages = Math.ceil(sortedFeatures.length / itemsPerPage) || 1;
  const paginatedFeatures = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedFeatures.slice(start, start + itemsPerPage);
  }, [sortedFeatures, currentPage, itemsPerPage]);

  // 지진 마커 렌더링
  useEffect(() => {
    const layerGroup = earthquakeLayerGroupRef.current;
    if (!layerGroup) return;

    layerGroup.clearLayers();
    markerMapRef.current.clear();

    if (fetchStatus === 'error') {
      return;
    }

    for (const feature of filteredFeatures) {
      const [lng, lat, rawDepth] = feature.geometry.coordinates;
      const magVal = feature.properties.mag;
      const radius = getRadiusByMagnitude(magVal);
      const depthCat = getDepthCategory(rawDepth);
      const isNegativeDepth = typeof rawDepth === 'number' && rawDepth < 0;

      const marker = L.circleMarker([lat, lng], {
        pane: 'earthquakePane',
        radius: radius,
        fillColor: depthCat.fillColor,
        color: depthCat.borderColor,
        weight: 1.5,
        opacity: 0.95,
        fillOpacity: 0.72,
      });

      const popupDiv = document.createElement('div');
      popupDiv.className = 'p-1 text-slate-800 text-xs space-y-1.5 min-w-[220px] max-w-[280px] font-sans';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'font-bold text-slate-900 border-b border-slate-200 pb-1';
      titleDiv.textContent = feature.properties.place || '위치 설명 정보 없음';
      popupDiv.appendChild(titleDiv);

      const magDiv = document.createElement('div');
      magDiv.className = 'flex items-center justify-between';
      const magSpan = document.createElement('span');
      if (magVal !== null && magVal !== undefined && typeof magVal === 'number' && !isNaN(magVal)) {
        magSpan.className = 'font-semibold text-slate-900';
        magSpan.textContent = `규모: M ${magVal.toFixed(1)}${feature.properties.magType ? ` (${feature.properties.magType})` : ''}`;
      } else {
        magSpan.className = 'font-semibold text-slate-500 italic';
        magSpan.textContent = '규모: 값 없음';
      }
      const radiusTag = document.createElement('span');
      radiusTag.className = 'text-[10px] text-slate-400';
      radiusTag.textContent = `반지름 ${Math.round(radius)}px`;
      magDiv.appendChild(magSpan);
      magDiv.appendChild(radiusTag);
      popupDiv.appendChild(magDiv);

      const depthDiv = document.createElement('div');
      const depthSpan = document.createElement('div');
      depthSpan.className = 'flex items-center gap-1.5';
      const colorDot = document.createElement('span');
      colorDot.style.backgroundColor = depthCat.fillColor;
      colorDot.className = 'inline-block w-2.5 h-2.5 rounded-full shrink-0';
      depthSpan.appendChild(colorDot);

      const depthTextSpan = document.createElement('span');
      if (rawDepth !== null && rawDepth !== undefined && typeof rawDepth === 'number' && !isNaN(rawDepth)) {
        depthTextSpan.textContent = `깊이: ${rawDepth.toFixed(1)} km [${depthCat.label} · ${depthCat.stageName}]`;
      } else {
        depthTextSpan.textContent = `깊이: 정보 없음 [${depthCat.label}]`;
      }
      depthSpan.appendChild(depthTextSpan);
      depthDiv.appendChild(depthSpan);

      if (isNegativeDepth) {
        const negNote = document.createElement('div');
        negNote.className = 'text-[10px] text-amber-700 bg-amber-50 p-1 rounded mt-0.5 leading-tight';
        negNote.textContent = '※ 음수(-) 깊이는 기준면(해수면) 고도 또는 진원 추정치와 관련된 값입니다.';
        depthDiv.appendChild(negNote);
      }
      popupDiv.appendChild(depthDiv);

      const timeDiv = document.createElement('div');
      timeDiv.className = 'text-[11px] text-slate-600';
      timeDiv.textContent = `발생 시각: ${formatKST(feature.properties.time)}`;
      popupDiv.appendChild(timeDiv);

      const safeUrl = getValidUSGSUrl(feature.properties.url);
      if (safeUrl) {
        const linkA = document.createElement('a');
        linkA.href = safeUrl;
        linkA.target = '_blank';
        linkA.rel = 'noopener noreferrer';
        linkA.className = 'inline-block text-blue-600 hover:text-blue-800 underline font-semibold mt-1 text-[11px]';
        linkA.textContent = 'USGS 상세 페이지 바로가기 →';
        popupDiv.appendChild(linkA);
      } else {
        const noUrlDiv = document.createElement('div');
        noUrlDiv.className = 'text-slate-400 italic text-[11px] mt-1';
        noUrlDiv.textContent = '상세 페이지 링크 없음';
        popupDiv.appendChild(noUrlDiv);
      }

      marker.bindPopup(popupDiv);

      const handleMarkerSelect = () => {
        setSelectedEarthquake({
          id: feature.id || `${lat},${lng},${feature.properties.time}`,
          place: feature.properties.place,
          mag: feature.properties.mag,
          magType: feature.properties.magType,
          depth: rawDepth,
          time: feature.properties.time,
          url: feature.properties.url,
          lat: Math.round(lat * 1000) / 1000,
          lng: Math.round(lng * 1000) / 1000,
          depthCategoryText: `${depthCat.label} (${depthCat.stageName})`,
          hasNegativeDepth: isNegativeDepth,
        });
      };

      marker.on('click', handleMarkerSelect);
      marker.addTo(layerGroup);

      if (feature.id) {
        markerMapRef.current.set(feature.id, marker);
      }
    }
  }, [filteredFeatures, fetchStatus]);

  // 목록 항목 선택 시 지도 이동 및 팝업 열기
  const handleSelectEarthquakeItem = (feature: EarthquakeFeature) => {
    const [lng, lat, rawDepth] = feature.geometry.coordinates;
    const depthCat = getDepthCategory(rawDepth);
    const isNegativeDepth = typeof rawDepth === 'number' && rawDepth < 0;

    setSelectedEarthquake({
      id: feature.id || `${lat},${lng},${feature.properties.time}`,
      place: feature.properties.place,
      mag: feature.properties.mag,
      magType: feature.properties.magType,
      depth: rawDepth,
      time: feature.properties.time,
      url: feature.properties.url,
      lat: Math.round(lat * 1000) / 1000,
      lng: Math.round(lng * 1000) / 1000,
      depthCategoryText: `${depthCat.label} (${depthCat.stageName})`,
      hasNegativeDepth: isNegativeDepth,
    });

    const map = mapInstanceRef.current;
    if (map) {
      map.setView([lat, lng], Math.max(map.getZoom(), 4), { animate: true });
      const marker = markerMapRef.current.get(feature.id);
      if (marker) {
        marker.openPopup();
      }
    }

    if (mobileViewMode === 'list') {
      setMobileViewMode('map');
    }
  };

  const handleResetFilters = () => {
    setSelectedPeriod('7d');
    setMinMagnitude(2.5);
    setSelectedDepthFilter('all');
  };

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20, 0], 2);
    }
  };

  const activeDepthLabel =
    DEPTH_FILTER_OPTIONS.find((d) => d.value === selectedDepthFilter)?.label || '전체';

  const startItemIdx = sortedFeatures.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItemIdx = Math.min(currentPage * itemsPerPage, sortedFeatures.length);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* 상단 헤더 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs shrink-0 mt-0.5 sm:mt-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-block text-xs font-semibold px-2 py-0.5 bg-rose-50 text-rose-700 rounded-md border border-rose-200">
                  중학교 과학 수업용
                </span>
                <span className="text-xs text-slate-400">|</span>
                <span className="text-xs font-medium text-rose-900 bg-rose-100/70 px-2 py-0.5 rounded border border-rose-300">
                  {PERIOD_CONFIG[selectedPeriod].titleLabel}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                지구는 지금 어디서 흔들릴까?
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 self-end sm:self-auto">
            <button
              onClick={handleRefresh}
              disabled={fetchStatus === 'loading'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-800 font-medium rounded-lg border border-rose-300 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="현재 지진 데이터 새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchStatus === 'loading' ? 'animate-spin text-rose-600' : ''}`} />
              <span>{fetchStatus === 'loading' ? '지진 갱신 중...' : '지진 데이터 새로고침'}</span>
            </button>

            <button
              onClick={handleResetView}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-medium rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer"
              title="지도 기본 위치로 복귀 (위도 20, 경도 0, 확대 2)"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>지도 위치 초기화</span>
            </button>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex-1 flex flex-col w-full gap-4">
        {/* 교과 개념 및 판 구조론 안내 배너 */}
        <section className="bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3 text-amber-950 flex flex-col gap-2 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
              <div className="text-xs sm:text-sm font-medium">
                <span className="font-bold text-amber-900 bg-amber-200/60 px-1.5 py-0.5 rounded mr-1">
                  과학 교과 핵심 개념
                </span>
                ‘규모는 지진의 크기를 나타내는 값이고, 진도는 장소에 따라 달라지는 흔들림의 정도입니다.’
              </div>
            </div>
            <div className="text-[11px] text-amber-800 shrink-0">
              ※ 원 크기는 지진 발생원 자체의 물리적 &lsquo;규모(Magnitude)&rsquo; 기준입니다.
            </div>
          </div>

          <div className="pt-2 border-t border-amber-200/60 flex items-start gap-2 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>[판 구조론 탐구 유의사항]</strong> 판 경계는 참고 모델입니다. 지진은 판 내부에서도 발생할 수 있으며, 이 지도는 미래 지진을 예측하지 않습니다.
            </p>
          </div>
        </section>

        {/* 대화형 필터 조작 패널 */}
        <section className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-rose-600" />
              <span className="font-bold text-sm text-slate-900">지진 및 판 경계 탐구 필터</span>
              <span className="text-xs text-slate-500">
                (지도, 목록, 요약 정보에 동일한 조건이 실시간 적용됩니다)
              </span>
            </div>

            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 rounded-md border border-slate-300 transition-colors cursor-pointer self-start md:self-auto"
              title="최근 7일 · 최소 규모 2.5 · 깊이 전체로 리셋"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>지진 조건 초기화</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">1. 지진 관측 기간</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {(['24h', '7d', '30d'] as PeriodOption[]).map((period) => (
                  <button
                    key={period}
                    onClick={() => setSelectedPeriod(period)}
                    disabled={fetchStatus === 'loading' && selectedPeriod !== period}
                    className={`py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer text-center ${
                      selectedPeriod === period
                        ? 'bg-white text-rose-700 shadow-xs font-bold border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {PERIOD_CONFIG[period].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="min-magnitude-select" className="font-semibold text-slate-700">
                  2. 최소 규모 <span className="text-slate-400 font-normal">(M 2.5 ~ 7.0)</span>
                </label>
                <span className="font-bold text-rose-600 font-mono bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                  M {minMagnitude.toFixed(1)} 이상
                </span>
              </div>
              <select
                id="min-magnitude-select"
                value={minMagnitude}
                onChange={(e) => setMinMagnitude(parseFloat(e.target.value))}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                {MAG_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    M {m.toFixed(1)} 이상 {m === 2.5 ? '(기본값 / 전체)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="depth-filter-select" className="block text-xs font-semibold text-slate-700">
                3. 진원 깊이 <span className="text-slate-400 font-normal">(천발·중발·심발 지진)</span>
              </label>
              <select
                id="depth-filter-select"
                value={selectedDepthFilter}
                onChange={(e) => setSelectedDepthFilter(e.target.value as DepthFilterOption)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-rose-500 cursor-pointer"
              >
                {DEPTH_FILTER_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label} {d.desc ? `(${d.desc})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 판 경계 토글 */}
          <div className="pt-2.5 border-t border-slate-200 bg-slate-50/80 -mx-3.5 -mb-3 p-3 rounded-b-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPlateBoundaries}
                  onChange={(e) => setShowPlateBoundaries(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-2 text-xs font-bold text-slate-900 flex items-center gap-1">
                  <GitCommit className="w-3.5 h-3.5 text-indigo-600" />
                  USGS 판 경계 레이어 표시
                </span>
              </label>

              {plateFetchStatus === 'loading' && (
                <span className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded inline-flex items-center gap-1 font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  판 경계 취득 중...
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-500">
              ※ 판 경계 레이어 표시 상태는 지진 목록 개수에 영향을 주지 않습니다.
            </div>
          </div>
        </section>

        {/* 요약 정보 카드 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold text-slate-700">조건 일치 지진 수</span>
              <Activity className="w-4 h-4 text-rose-500" />
            </div>
            <div className="my-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-rose-700">
                {fetchStatus === 'loading'
                  ? '...'
                  : fetchStatus === 'error'
                    ? '실패'
                    : summaryStats.total.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 ml-1">건</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              피드 전체(M2.5+): {rawTotalCount.toLocaleString()}건
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="font-semibold text-slate-700">최대 규모 (Max Mag)</span>
              <Maximize2 className="w-4 h-4 text-amber-500" />
            </div>
            <div className="my-1">
              {fetchStatus === 'loading' ? (
                <span className="text-2xl font-bold text-slate-400">...</span>
              ) : summaryStats.total === 0 || summaryStats.maxMag === null ? (
                <span className="text-base sm:text-lg font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  해당 없음
                </span>
              ) : (
                <span className="text-2xl sm:text-3xl font-extrabold text-rose-800">
                  M {summaryStats.maxMag.toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              규모 정보 결측: <strong className="text-slate-700">{summaryStats.missingMagCount}건</strong> (계산 제외)
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1 lg:col-span-2">
            <div className="flex items-center justify-between text-slate-500 mb-1.5">
              <span className="font-semibold text-slate-700">진원 깊이 구간별 분포</span>
              <span className="text-[11px] text-slate-400">천발 &middot; 중발 &middot; 심발</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center my-0.5">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-1.5">
                <div className="text-[10px] text-orange-800 font-medium">천발 (&lt;70km)</div>
                <div className="text-base font-bold text-orange-950">
                  {summaryStats.shallowCount.toLocaleString()}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-1.5">
                <div className="text-[10px] text-blue-800 font-medium">중발 (70~300)</div>
                <div className="text-base font-bold text-blue-950">
                  {summaryStats.intermediateCount.toLocaleString()}
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-1.5">
                <div className="text-[10px] text-purple-800 font-medium">심발 (&ge;300km)</div>
                <div className="text-base font-bold text-purple-950">
                  {summaryStats.deepCount.toLocaleString()}
                </div>
              </div>

              <div className="bg-slate-100 border border-slate-200 rounded-lg p-1.5">
                <div className="text-[10px] text-slate-600 font-medium">깊이 미기재</div>
                <div className="text-base font-bold text-slate-700">
                  {summaryStats.missingDepthCount.toLocaleString()}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mt-1">
              ※ 깊이 구간은 지하 발생 깊이 분류이며 위험 등급을 나타내지 않습니다.
            </p>
          </div>
        </section>

        {/* 모바일 뷰 토글 버튼 */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
          <p className="text-[11px] text-slate-500">
            ※ 위 수치는 현재 화면 안쪽만이 아니라 <strong>선택한 조건(기간: {PERIOD_CONFIG[selectedPeriod].label}, 최소 규모: M {minMagnitude.toFixed(1)}, 깊이: {activeDepthLabel}) 전체 지진 수</strong>입니다.
          </p>

          <div className="flex md:hidden items-center gap-1 bg-slate-200/80 p-1 rounded-lg self-start sm:self-auto">
            <button
              onClick={() => setMobileViewMode('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                mobileViewMode === 'all' ? 'bg-white text-rose-700 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              전체 보기
            </button>
            <button
              onClick={() => setMobileViewMode('map')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                mobileViewMode === 'map' ? 'bg-white text-rose-700 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              지도 전용
            </button>
            <button
              onClick={() => setMobileViewMode('list')}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                mobileViewMode === 'list' ? 'bg-white text-rose-700 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              목록 전용
            </button>
          </div>
        </section>

        {/* 0건 결과 시 안내 배너 */}
        {fetchStatus === 'success' && filteredFeatures.length === 0 && (
          <section className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs sm:text-sm flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-950">
                현재 조건에 맞는 지진이 없습니다. 기간을 늘리거나 최소 규모를 낮춰 보세요.
              </p>
              <p className="text-xs text-amber-800 mt-1">
                (예: 최소 규모를 M 2.5로 낮추거나, 기간을 &lsquo;최근 30일&rsquo;로 변경해 보세요.)
              </p>
            </div>
          </section>
        )}

        {/* 지도 및 범례 영역 */}
        {(mobileViewMode === 'all' || mobileViewMode === 'map') && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <section className="lg:col-span-8 xl:col-span-9 flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <Layers className="w-4 h-4 text-rose-600" />
                  <span>
                    세계 지도 (조건 일치 {filteredFeatures.length.toLocaleString()}건 마커 렌더링)
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    중심: {mapCenter.lat}°N, {mapCenter.lng}°E
                  </span>
                  <span className="bg-slate-200 px-2 py-0.5 rounded text-[11px] font-mono font-medium text-slate-700">
                    확대: {currentZoom}
                  </span>
                </div>
              </div>

              <div className="relative w-full flex-1 min-h-[440px] sm:min-h-[480px] md:min-h-[540px] h-[55vh]">
                <div
                  ref={mapContainerRef}
                  id="leaflet-map"
                  className="absolute inset-0 w-full h-full"
                  style={{ height: '100%', width: '100%' }}
                />

                {fetchStatus === 'loading' && (
                  <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-xs border border-slate-300 shadow-md rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-slate-800">
                    <RefreshCw className="w-3.5 h-3.5 text-rose-600 animate-spin" />
                    <span>{PERIOD_CONFIG[selectedPeriod].label} 지진 피드를 불러오는 중...</span>
                  </div>
                )}
              </div>
            </section>

            <aside className="lg:col-span-4 xl:col-span-3 flex flex-col gap-3">
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
                    진원 깊이 범례 (원 색상)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">DEPTH</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-1.5 rounded-md bg-orange-50/70 border border-orange-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-orange-500 border border-orange-700 inline-block shrink-0"></span>
                      <span className="font-semibold text-orange-950">70km 미만</span>
                    </div>
                    <span className="text-[10px] font-medium text-orange-800 bg-orange-100 px-1.5 py-0.5 rounded">
                      천발 지진
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded-md bg-blue-50/70 border border-blue-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-blue-600 border border-blue-800 inline-block shrink-0"></span>
                      <span className="font-semibold text-blue-950">70km ~ 300km 미만</span>
                    </div>
                    <span className="text-[10px] font-medium text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                      중발 지진
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded-md bg-purple-50/70 border border-purple-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-purple-600 border border-purple-800 inline-block shrink-0"></span>
                      <span className="font-semibold text-purple-950">300km 이상</span>
                    </div>
                    <span className="text-[10px] font-medium text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded">
                      심발 지진
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-1.5 rounded-md bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-slate-400 border border-slate-600 inline-block shrink-0"></span>
                      <span className="font-semibold text-slate-700">깊이 정보 없음</span>
                    </div>
                    <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                      미측정 / 결측
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-indigo-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2 mb-2">
                  <h3 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <GitCommit className="w-3.5 h-3.5 text-indigo-600" />
                    판 경계 범례 (선 모양)
                  </h3>
                  <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 px-1.5 py-0.5 rounded">
                    PLATES
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between p-1 rounded bg-red-50/70 border border-red-200">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-1 bg-red-700 rounded inline-block"></span>
                      <span className="font-semibold text-red-950">수렴 경계</span>
                    </div>
                    <span className="text-[10px] text-red-800">짙은 붉은 실선</span>
                  </div>

                  <div className="flex items-center justify-between p-1 rounded bg-teal-50/70 border border-teal-200">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-0.5 border-t-2 border-dashed border-teal-700 inline-block shrink-0"></span>
                      <span className="font-semibold text-teal-950">발산 경계</span>
                    </div>
                    <span className="text-[10px] text-teal-800">짙은 청록 긴 점선</span>
                  </div>

                  <div className="flex items-center justify-between p-1 rounded bg-gray-50 border border-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-0.5 border-t-2 border-dotted border-gray-700 inline-block shrink-0"></span>
                      <span className="font-semibold text-gray-950">보존 경계</span>
                    </div>
                    <span className="text-[10px] text-gray-800">짙은 회색 짧은 점선</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span>
                    규모 범례 (원 반지름)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">4~22px</span>
                </div>
                <div className="flex items-center justify-between text-xs px-1 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-500 inline-block"></span>
                    <span>M 2.5</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-slate-500 inline-block"></span>
                    <span>M 4.0</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-slate-500 inline-block"></span>
                    <span>M 5.5</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-7 h-7 rounded-full bg-slate-500 inline-block"></span>
                    <span>M 7.0+</span>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-amber-900 bg-amber-50/70 p-1.5 rounded leading-tight">
                  이 식은 시각적 비교를 위한 것이며 실제 에너지 비율이나 피해 반경을 뜻하지 않습니다.
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* 선택한 판 경계선 정보 카드 */}
        {selectedPlate && (
          <section className="bg-indigo-50/70 border-2 border-indigo-300 rounded-xl p-3.5 sm:p-4 shadow-xs relative">
            <button
              onClick={() => setSelectedPlate(null)}
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="닫기"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: selectedPlate.color }}></span>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">선택한 판 경계선 상세 정보</h2>
              <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded font-semibold">
                {selectedPlate.koreanName}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm mt-2">
              <div className="bg-white p-2.5 rounded-lg border border-indigo-200">
                <div className="text-[11px] text-slate-500 font-medium">원문 NAME (판 경계 명칭)</div>
                <div className="text-slate-900 font-bold mt-0.5">
                  {selectedPlate.name || '원자료 명칭 미기재 (NAME 없음)'}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-indigo-200">
                <div className="text-[11px] text-slate-500 font-medium">경계 유형 (LABEL 번역)</div>
                <div className="text-slate-900 font-bold mt-0.5">
                  {selectedPlate.koreanName} <span className="text-slate-500 font-normal">({selectedPlate.rawLabel})</span>
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-indigo-200">
                <div className="text-[11px] text-slate-500 font-medium">지도 표시 선 형태</div>
                <div className="text-slate-900 font-semibold mt-0.5">{selectedPlate.lineDesc}</div>
              </div>
            </div>
          </section>
        )}

        {/* 선택한 지진 상세 정보 카드 */}
        {selectedEarthquake && (
          <section className="bg-white border-2 border-rose-300 rounded-xl p-4 sm:p-5 shadow-xs relative">
            <button
              onClick={() => setSelectedEarthquake(null)}
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="상세 정보 닫기"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full bg-rose-600 inline-block"></span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">선택한 지진 상세 정보</h2>
              <span className="text-xs text-slate-500 font-mono">ID: {selectedEarthquake.id}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs sm:text-sm">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 col-span-1 sm:col-span-2">
                <div className="text-xs text-slate-500 font-medium mb-1">위치 설명</div>
                <div className="text-slate-900 font-semibold text-sm sm:text-base">
                  {selectedEarthquake.place || '위치 설명 정보 없음'}
                </div>
                <div className="text-xs text-slate-500 mt-1 font-mono">
                  진앙 좌표: 위도 {selectedEarthquake.lat}°, 경도 {selectedEarthquake.lng}°
                </div>
              </div>

              <div className="bg-rose-50/70 p-3 rounded-lg border border-rose-200">
                <div className="text-xs text-rose-700 font-medium mb-1">규모 (Magnitude)</div>
                <div className="text-rose-950 font-bold text-lg">
                  {selectedEarthquake.mag !== null &&
                  selectedEarthquake.mag !== undefined &&
                  typeof selectedEarthquake.mag === 'number' &&
                  !isNaN(selectedEarthquake.mag)
                    ? `M ${selectedEarthquake.mag.toFixed(1)}`
                    : '값 없음 (정보 없음)'}
                </div>
                <div className="text-xs text-rose-800 mt-0.5">
                  종류: {selectedEarthquake.magType || '미기재'}
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500 font-medium mb-1">진원 깊이</div>
                <div className="text-slate-900 font-bold text-lg">
                  {selectedEarthquake.depth !== null &&
                  selectedEarthquake.depth !== undefined &&
                  typeof selectedEarthquake.depth === 'number' &&
                  !isNaN(selectedEarthquake.depth)
                    ? `${selectedEarthquake.depth.toFixed(1)} km`
                    : '깊이 정보 없음'}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 font-medium">
                  {selectedEarthquake.depthCategoryText}
                </div>
                {selectedEarthquake.hasNegativeDepth && (
                  <div className="text-[10px] text-amber-700 bg-amber-50 p-1 rounded mt-1.5 leading-tight">
                    ※ 음수(-) 깊이는 원자료 값을 그대로 유지한 것이며, 기준면(평균 해수면) 고도 또는 진원 결정 추정치와 관련된 값입니다.
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 col-span-1 sm:col-span-2 md:col-span-1">
                <div className="text-xs text-slate-500 font-medium mb-1">발생 시각</div>
                <div className="text-slate-900 font-semibold text-xs leading-snug">
                  {formatKST(selectedEarthquake.time)}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">
                미국 지질조사국(USGS) 웹사이트에서 파형 및 관측소 상세 데이터를 열람할 수 있습니다.
              </span>
              {getValidUSGSUrl(selectedEarthquake.url) ? (
                <a
                  href={getValidUSGSUrl(selectedEarthquake.url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg border border-blue-200 transition-colors"
                >
                  <span>USGS 지진 상세 페이지 열기</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <span className="text-slate-400 italic">USGS 상세 페이지 링크 없음</span>
              )}
            </div>
          </section>
        )}

        {/* ‘수업에서 탐구하기’ 패널 (새로 추가된 고정 교육 콘텐츠: 관찰 → 예상 → 비교 → 설명) */}
        <section className="bg-white border-2 border-indigo-200 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-indigo-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-2xs">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  수업에서 탐구하기 (중학교 과학 탐구 가이드)
                </h2>
                <p className="text-xs text-slate-600">
                  실제 관측 자료를 조작하며 &lsquo;관찰 &rarr; 예상 &rarr; 비교 &rarr; 설명&rsquo; 순서로 지각 변동과 판 구조론을 탐구해 보세요.
                </p>
              </div>
            </div>

            <div className="text-xs text-indigo-900 font-medium bg-indigo-50 px-3 py-1 rounded-md border border-indigo-200 self-start sm:self-auto">
              고정 탐구 활동 5단계
            </div>
          </div>

          {/* 5가지 고정 탐구 활동 카드 목록 */}
          <div className="space-y-3.5 text-xs sm:text-sm">
            {/* 활동 1 */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    활동 1
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">경계 예상하기</h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">관찰 &rarr; 예상</span>
              </div>

              {/* 조작 안내 */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">[조작 안내] </strong>
                  상단 필터에서 <strong>기간: 최근 30일</strong>, <strong>최소 규모: M 2.5</strong>, <strong>깊이: 전체</strong>로 맞추고, <strong>판 경계 표시를 끕니다</strong>.
                </div>
              </div>

              {/* 학생용 질문 */}
              <div className="pl-3 border-l-2 border-indigo-500 py-0.5 space-y-1">
                <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                  [학생용 질문] 지진이 모여 있는 곳은 어떤 모양인가? 이 분포를 보고 판 경계를 어디에 그릴 수 있을까?
                </p>
                <p className="text-xs text-slate-600">
                  &bull; <strong>비교 탐구:</strong> 지진이 띠 모양으로 모여 있는 위치를 확인한 후, 상단 필터의 <strong>&lsquo;USGS 판 경계 레이어 표시&rsquo;</strong>를 켜서 내가 예상한 위치와 실제 판 경계선을 직접 비교해 보세요.
                </p>
              </div>

              {/* 교사용 해설 (펼치기 토글) */}
              <div className="pt-1">
                <button
                  onClick={() => toggleTeacherGuide(1)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{expandedTeacherGuides[1] ? '교사용 해설 접기' : '교사용 해설 보기'}</span>
                  {expandedTeacherGuides[1] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedTeacherGuides[1] && (
                  <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 space-y-1">
                    <p className="font-bold text-indigo-900">[교사용 지도 해설]</p>
                    <p className="leading-relaxed">
                      지진은 전 세계에 무작위로 흩어져 있지 않고 주로 좁은 띠 모양(지진대)을 형성합니다.
                      학생들은 지진 발생 지점들의 연결선을 통해 지구 표면이 거대한 판들로 나뉘어 있음을 직관적으로 예상할 수 있습니다.
                      판 경계를 켰을 때 태평양 가장자리(환태평양 조산대, 일명 불의 고리)와 대서양 중앙 해령 등을 따라 지진이 집중되는 현상을 확인시킵니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 활동 2 */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    활동 2
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">예외 찾기</h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">관찰 &rarr; 비교</span>
              </div>

              {/* 조작 안내 */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">[조작 안내] </strong>
                  <strong>판 경계를 켠 상태</strong>에서 지도를 확대하여 판 경계선 주변과 대륙 내부를 자세히 관찰합니다.
                </div>
              </div>

              {/* 학생용 질문 */}
              <div className="pl-3 border-l-2 border-indigo-500 py-0.5">
                <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                  [학생용 질문] 모든 지진이 표시된 판 경계선 위에 있는가?
                </p>
              </div>

              {/* 교사용 해설 */}
              <div className="pt-1">
                <button
                  onClick={() => toggleTeacherGuide(2)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{expandedTeacherGuides[2] ? '교사용 해설 접기' : '교사용 해설 보기'}</span>
                  {expandedTeacherGuides[2] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedTeacherGuides[2] && (
                  <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 space-y-1">
                    <p className="font-bold text-indigo-900">[교사용 지도 해설]</p>
                    <p className="leading-relaxed">
                      <strong>판 내부 지진도 있으며 경계 모델의 단순화, 위치 추정과 지도 축척의 영향도 함께 고려해야 한다.</strong>
                      <br />
                      지진의 대다수는 판 경계에 집중되지만, 판 내부의 오래된 단층대나 지각 내 응력 축적으로도 지진이 일어납니다.
                      또한 지도에 표시된 선은 전 지구적 거시 모델(Peter Bird 2003)로 단순화된 선이며, 관측소의 진앙 결정 오차와 지도 축척에 따라 선과 수 km~수십 km 떨어져 찍힐 수 있음을 지도합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 활동 3 */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    활동 3
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">깊이 비교하기</h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">비교 &rarr; 설명</span>
              </div>

              {/* 조작 안내 */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">[조작 안내] </strong>
                  <strong>판 경계를 켠 후</strong> 일본 열도, 통가 해구, 남아메리카 안데스 산맥 등 <strong>수렴 경계(붉은 실선) 부근을 관찰</strong>하며, 상단 필터에서 <strong>진원 깊이를 &lsquo;70km 미만&rsquo;, &lsquo;70~300km&rsquo;, &lsquo;300km 이상&rsquo;</strong>으로 바꾸어 봅니다.
                </div>
              </div>

              {/* 학생용 질문 */}
              <div className="pl-3 border-l-2 border-indigo-500 py-0.5">
                <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                  [학생용 질문] 얕은 지진과 깊은 지진은 같은 곳에 분포하는가?
                </p>
              </div>

              {/* 교사용 해설 */}
              <div className="pt-1">
                <button
                  onClick={() => toggleTeacherGuide(3)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{expandedTeacherGuides[3] ? '교사용 해설 접기' : '교사용 해설 보기'}</span>
                  {expandedTeacherGuides[3] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedTeacherGuides[3] && (
                  <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 space-y-1">
                    <p className="font-bold text-indigo-900">[교사용 지도 해설]</p>
                    <p className="leading-relaxed">
                      <strong>섭입 지역에서 깊이 분포를 비교할 수 있지만, 최근 자료에 깊은 지진이 충분하지 않을 수 있다. 원하는 패턴이 보이지 않는 경우도 관찰 결과로 기록한다.</strong>
                      <br />
                      수렴형 판 경계(섭입대)에서는 해구에서 대륙 쪽으로 들어갈수록 판이 지하 깊숙이 파고들면서 진원의 깊이가 점점 깊어집니다(베니오프대).
                      그러나 USGS 최근 관측 기간 동안 심발 지진(&ge;300km, 보라색)이 발생하지 않았을 수도 있습니다.
                      교과서의 이론적 그림과 단기 관측 데이터가 일치하지 않는 경우도 &lsquo;실제 관측 자료의 특성&rsquo;으로 받아들이도록 지도합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 활동 4 */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    활동 4
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">규모 조건 바꾸기</h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">관찰 &rarr; 비교</span>
              </div>

              {/* 조작 안내 */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">[조작 안내] </strong>
                  같은 관측 기간(예: 최근 7일 또는 30일)에서 상단 필터의 <strong>최소 규모를 &lsquo;M 2.5 이상&rsquo;에서 &lsquo;M 4.5 이상&rsquo;으로 변경</strong>하며 지도와 요약 건수를 비교합니다.
                </div>
              </div>

              {/* 학생용 질문 */}
              <div className="pl-3 border-l-2 border-indigo-500 py-0.5">
                <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                  [학생용 질문] 조건을 바꾸니 무엇이 보이고 무엇이 사라지는가?
                </p>
              </div>

              {/* 교사용 해설 */}
              <div className="pt-1">
                <button
                  onClick={() => toggleTeacherGuide(4)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{expandedTeacherGuides[4] ? '교사용 해설 접기' : '교사용 해설 보기'}</span>
                  {expandedTeacherGuides[4] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedTeacherGuides[4] && (
                  <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 space-y-1">
                    <p className="font-bold text-indigo-900">[교사용 지도 해설]</p>
                    <p className="leading-relaxed">
                      <strong>필터 조건은 우리가 관찰하는 자료의 범위를 바꾼다.</strong>
                      <br />
                      규모 2.5 이상일 때는 지진대 전체를 이루는 수많은 작은 지진들이 나타나 판의 경계가 선명한 띠로 보이지만,
                      규모 4.5 이상으로 올리면 작은 지진들이 걸러져 점의 개수가 급격히 줄어듭니다.
                      이를 통해 필터링 기준에 따라 데이터의 시각적 패턴이 달라짐을 이해하고, 지진은 작은 규모일수록 발생 빈도가 훨씬 높다는 지진학적 특징을 파악하도록 지도합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 활동 5 */}
            <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-md">
                    활동 5
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">자료의 한계 찾기</h3>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">설명 &rarr; 과학적 소양</span>
              </div>

              {/* 조작 안내 */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                <Eye className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900">[조작 안내] </strong>
                  현재 화면에 보이는 지진 분포와 관측 기간(24시간, 7일, 30일)의 시간적 스케일을 종합적으로 생각해 봅니다.
                </div>
              </div>

              {/* 학생용 질문 */}
              <div className="pl-3 border-l-2 border-indigo-500 py-0.5">
                <p className="font-semibold text-slate-900 text-xs sm:text-sm">
                  [학생용 질문] 오늘 화면만으로 어느 지역이 가장 안전한지 또는 다음 지진이 어디서 날지 알 수 있는가?
                </p>
              </div>

              {/* 교사용 해설 */}
              <div className="pt-1">
                <button
                  onClick={() => toggleTeacherGuide(5)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{expandedTeacherGuides[5] ? '교사용 해설 접기' : '교사용 해설 보기'}</span>
                  {expandedTeacherGuides[5] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {expandedTeacherGuides[5] && (
                  <div className="mt-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs text-indigo-950 space-y-1">
                    <p className="font-bold text-indigo-900">[교사용 지도 해설]</p>
                    <p className="leading-relaxed">
                      <strong>짧은 기간의 사건 분포만으로 안전도나 미래 지진을 판단할 수 없다.</strong>
                      <br />
                      지질학적 지진 주기는 수십 년에서 수백 년 단위입니다.
                      최근 한 달 동안 지진이 없었다고 해서 그 지역이 지진으로부터 안전한 곳이 아니며, 오히려 변형 에너지가 누적되고 있는 지진 공백역(Seismic gap)일 수도 있습니다.
                      또한 현대 지진학으로도 다음 지진이 언제, 어디서, 어느 규모로 발생할지 정확히 예측하는 것은 불가능하다는 점을 강조합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 지진 목록 테이블 및 페이지네이션 */}
        {(mobileViewMode === 'all' || mobileViewMode === 'list') && (
          <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-rose-600" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    조건 일치 지진 목록
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    전체 <strong>{filteredFeatures.length.toLocaleString()}건</strong> 중{' '}
                    <strong>{startItemIdx}~{endItemIdx}건</strong> 표시 (페이지 {currentPage} / {totalPages})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs self-start sm:self-auto">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium mr-1">정렬:</span>
                <button
                  onClick={() => setSortOrder('latest')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border ${
                    sortOrder === 'latest'
                      ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  최신순
                </button>
                <button
                  onClick={() => setSortOrder('magnitude')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors border ${
                    sortOrder === 'magnitude'
                      ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  규모 큰 순
                </button>
              </div>
            </div>

            {paginatedFeatures.length === 0 ? (
              <div className="py-8 text-center text-xs sm:text-sm text-slate-500">
                표시할 지진 항목이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {paginatedFeatures.map((feature) => {
                  const [lng, lat, rawDepth] = feature.geometry.coordinates;
                  const mag = feature.properties.mag;
                  const depthCat = getDepthCategory(rawDepth);
                  const isSelected = selectedEarthquake?.id === feature.id;

                  return (
                    <div
                      key={feature.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectEarthquakeItem(feature)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelectEarthquakeItem(feature);
                        }
                      }}
                      className={`p-3 rounded-lg border transition-all cursor-pointer text-left focus:outline-hidden focus:ring-2 focus:ring-rose-500 select-none ${
                        isSelected
                          ? 'bg-rose-50/80 border-rose-400 shadow-xs ring-1 ring-rose-400'
                          : 'bg-slate-50/60 hover:bg-slate-100/80 border-slate-200'
                      }`}
                      title="클릭하여 지도 해당 위치로 이동 및 팝업 열기"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: depthCat.fillColor }}
                          ></span>
                          <span className="font-extrabold text-sm sm:text-base text-rose-900 font-mono">
                            {mag !== null && mag !== undefined && typeof mag === 'number' && !isNaN(mag)
                              ? `M ${mag.toFixed(1)}`
                              : '값 없음'}
                          </span>
                          {feature.properties.magType && (
                            <span className="text-[10px] text-slate-500 bg-slate-200/60 px-1 py-0.2 rounded font-mono">
                              {feature.properties.magType}
                            </span>
                          )}
                        </div>

                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                            rawDepth !== null && rawDepth !== undefined && typeof rawDepth === 'number' && !isNaN(rawDepth)
                              ? rawDepth < 70
                                ? 'bg-orange-50 text-orange-800 border-orange-200'
                                : rawDepth < 300
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-purple-50 text-purple-800 border-purple-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {rawDepth !== null && rawDepth !== undefined && typeof rawDepth === 'number' && !isNaN(rawDepth)
                            ? `${rawDepth.toFixed(1)} km (${depthCat.stageName})`
                            : '깊이 결측'}
                        </span>
                      </div>

                      <div className="text-xs sm:text-sm font-semibold text-slate-800 line-clamp-1 mb-1">
                        {feature.properties.place || '위치 설명 정보 없음'}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatKST(feature.properties.time)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {Math.round(lat * 10) / 10}°, {Math.round(lng * 10) / 10}°
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
                <span className="text-slate-500">
                  페이지 <strong>{currentPage}</strong> / {totalPages}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="이전 페이지"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-7 h-7 rounded-md font-medium text-xs cursor-pointer transition-colors ${
                            currentPage === pageNum
                              ? 'bg-rose-600 text-white font-bold'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="다음 페이지"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 푸터 및 공식 출처 링크 */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-700">
          ‘지구는 지금 어디서 흔들릴까?’ &mdash; 중학교 과학 수업용 정적 웹앱 (React + Vite)
        </p>
        <p className="text-[11px] text-slate-500">
          지진 관측 자료 출처: USGS Earthquake Hazards Program (규모 2.5 이상 피드) &middot; 지도 배경: OpenStreetMap contributors
        </p>
        <p className="text-[11px] text-slate-500">
          판 경계 자료 출처: USGS Tectonic Plate Boundaries &middot; 원자료: Peter Bird (2003) &lsquo;An updated digital model of plate boundaries&rsquo;
          &middot;{' '}
          <a
            href="https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-0.5 font-medium"
          >
            <span>USGS MapServer 공식 서비스 링크</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      </footer>
    </div>
  );
}
