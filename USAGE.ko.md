# Graphier — 사용 가이드

> React를 위한 고성능 3D/2D 그래프 렌더러. Three.js와 d3-force-3d 기반.

---

## 목차

1. [설치](#1-설치)
2. [빠른 시작](#2-빠른-시작)
3. [핵심 컴포넌트: NetworkGraph3D](#3-핵심-컴포넌트-networkgraph3d)
4. [Props 레퍼런스](#4-props-레퍼런스)
5. [명령형 Ref API](#5-명령형-ref-api)
6. [테마 시스템](#6-테마-시스템)
7. [스타일 설정](#7-스타일-설정)
8. [레이아웃 설정](#8-레이아웃-설정)
9. [렌더러 설정](#9-렌더러-설정)
10. [노드 상세 패널](#10-노드-상세-패널)
11. [2D 서브그래프 뷰](#11-2d-서브그래프-뷰)
12. [그래프 분석 모듈](#12-그래프-분석-모듈)
13. [키보드 컨트롤](#13-키보드-컨트롤)
14. [증분 데이터 업데이트](#14-증분-데이터-업데이트)
15. [고급 패턴](#15-고급-패턴)
16. [Next.js / SSR 설정](#16-nextjs--ssr-설정)
17. [타입 레퍼런스](#17-타입-레퍼런스)
18. [성능 관련 참고사항](#18-성능-관련-참고사항)

---

## 1. 설치

```bash
npm install graphier three react react-dom
```

**피어 의존성:**

| 패키지       | 버전         |
|-------------|-------------|
| `react`     | >= 18.0.0   |
| `react-dom` | >= 18.0.0   |
| `three`     | >= 0.150.0  |

---

## 2. 빠른 시작

```tsx
import { NetworkGraph3D, type GraphData } from "graphier";

const data: GraphData = {
  nodes: [
    { id: "alice", type: "person", label: "Alice", val: 10 },
    { id: "bob", type: "person", label: "Bob", val: 5 },
    { id: "project-x", type: "repo", label: "Project X", val: 20 },
  ],
  links: [
    { source: "alice", target: "project-x", type: "owns" },
    { source: "bob", target: "project-x", type: "contributes" },
    { source: "alice", target: "bob", type: "follows" },
  ],
};

export default function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <NetworkGraph3D data={data} />
    </div>
  );
}
```

컴포넌트는 부모 컨테이너를 가득 채웁니다. 부모 요소에 명시적인 width와 height가 있어야 합니다.

---

## 3. 핵심 컴포넌트: NetworkGraph3D

```tsx
import { useRef, useState } from "react";
import {
  NetworkGraph3D,
  type NetworkGraph3DRef,
  type GraphNode,
} from "graphier";

function MyGraph() {
  const graphRef = useRef<NetworkGraph3DRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      <NetworkGraph3D
        ref={graphRef}
        data={data}
        selectedNodeId={selectedId}
        highlightHops={3}
        onNodeClick={(node) => setSelectedId(node?.id ?? null)}
        onNodeDoubleClick={(node) => console.log("더블클릭", node)}
        onNodeHover={(node) => console.log("호버", node?.id)}
        theme="celestial"
        style={{ bloomStrength: 0.7, fogDensity: 0.0004 }}
        labelFormatter={(node) => node.label ?? node.id}
        nodeValueAccessor={(node) => node.val ?? 1}
      />
    </div>
  );
}
```

---

## 4. Props 레퍼런스

### `NetworkGraph3DProps`

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `data` | `GraphData` | **(필수)** | 그래프 노드와 링크 |
| `selectedNodeId` | `string \| null` | `null` | 현재 선택된 노드 (제어 모드) |
| `highlightHops` | `number` | `3` | 선택된 노드로부터 하이라이트할 홉 수 |
| `onNodeClick` | `(node: GraphNode \| null) => void` | — | 노드 클릭 또는 배경 클릭(null) 시 발생 |
| `onNodeDoubleClick` | `(node: GraphNode) => void` | — | 노드 더블클릭 시 발생 |
| `onNodeHover` | `(node: GraphNode \| null) => void` | — | 호버 진입/이탈 시 발생 |
| `theme` | `ThemeConfig \| string` | `"celestial"` | 테마 객체 또는 프리셋 이름 |
| `style` | `StyleConfig` | `DEFAULT_STYLE` | 시각적 스타일 오버라이드 |
| `layout` | `LayoutConfig` | `DEFAULT_LAYOUT` | 포스 레이아웃 설정 |
| `renderer` | `RendererConfig` | `{ antialias: false, pixelRatioMax: 1.5 }` | WebGL 설정 |
| `labelFormatter` | `(node: GraphNode) => string` | — | 커스텀 라벨 텍스트 포맷터 |
| `nodeValueAccessor` | `(node: GraphNode) => number` | — | 커스텀 노드 크기 접근자 |

### `GraphData`

```typescript
interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
```

### `GraphNode`

```typescript
interface GraphNode {
  id: string;              // 고유 식별자 (필수)
  type?: string;           // 카테고리 → 테마 색상에 매핑
  label?: string;          // 표시 라벨 (기본값: id)
  val?: number;            // 크기 가중치 (기본값: 1)
  group?: string;          // 자동 색상 할당을 위한 그룹 키
  [key: string]: unknown;  // 임의의 추가 데이터
}
```

### `GraphLink`

```typescript
interface GraphLink {
  source: string;          // 소스 노드 id (필수)
  target: string;          // 타겟 노드 id (필수)
  type?: string;           // 관계 유형 → 테마 색상에 매핑
  weight?: number;         // 엣지 가중치 (기본값: 1)
  [key: string]: unknown;  // 임의의 추가 데이터
}
```

---

## 5. 명령형 Ref API

`useRef<NetworkGraph3DRef>`를 통해 ref에 접근합니다:

```tsx
const graphRef = useRef<NetworkGraph3DRef>(null);

// 카메라를 특정 위치로 애니메이션 이동
graphRef.current?.cameraPosition(
  { x: 100, y: 50, z: 200 },   // 카메라 위치
  { x: 0, y: 0, z: 0 },        // 바라보는 대상
  1000                            // 지속 시간 (ms)
);

// 모든 노드가 보이도록 줌
graphRef.current?.zoomToFit(800, 100);  // 지속 시간, 패딩

// 줌 인 / 줌 아웃
graphRef.current?.zoomIn();
graphRef.current?.zoomOut();

// 특정 노드에 포커스
graphRef.current?.focusNode("node-id", 1200);

// 데이터 증분 추가 (전체 리빌드 없음)
const newCount = graphRef.current?.appendData(
  [{ id: "new-node", type: "person", label: "New" }],
  [{ source: "alice", target: "new-node", type: "follows" }]
);

// Three.js 내부 접근
const scene = graphRef.current?.getScene();
const renderer = graphRef.current?.getRenderer();
const camera = graphRef.current?.getCamera();

// 스크린샷 캡처
const blob = await graphRef.current?.screenshot();
```

### 메서드 레퍼런스

| 메서드 | 시그니처 | 설명 |
|--------|----------|------|
| `cameraPosition` | `(pos, lookAt, duration?) → void` | 카메라를 특정 위치로 애니메이션 이동 |
| `zoomToFit` | `(duration?, padding?) → void` | 모든 노드가 화면에 들어오도록 줌 (기본: 800ms, 100px) |
| `zoomIn` | `() → void` | 중심으로 줌 인 (×0.65) |
| `zoomOut` | `() → void` | 중심에서 줌 아웃 (×1.5) |
| `focusNode` | `(nodeId, duration?) → void` | 특정 노드에 카메라 포커스 (기본: 1200ms) |
| `appendData` | `(nodes, links) → number` | 노드/링크를 증분 추가; 새로 추가된 노드 수 반환 |
| `getScene` | `() → THREE.Scene \| null` | Three.js 씬 접근 |
| `getRenderer` | `() → THREE.WebGLRenderer \| null` | WebGL 렌더러 접근 |
| `getCamera` | `() → THREE.PerspectiveCamera \| null` | 카메라 접근 |
| `screenshot` | `() → Promise<Blob \| null>` | 현재 화면을 PNG blob으로 캡처 |

---

## 6. 테마 시스템

### 프리셋 테마 사용

```tsx
// 이름으로
<NetworkGraph3D data={data} theme="celestial" />
<NetworkGraph3D data={data} theme="neon" />
<NetworkGraph3D data={data} theme="minimal" />

// import로
import { celestial, neon, minimal } from "graphier";
<NetworkGraph3D data={data} theme={celestial} />
```

### 커스텀 테마

```tsx
import { celestial, type ThemeConfig } from "graphier";

const myTheme: ThemeConfig = {
  ...celestial,  // 프리셋 확장
  nodeColors: {
    person: "#58a6ff",
    repo: "#3fb950",
    topic: "#d29922",
    org: "#bc8cff",
  },
  nodeColorsBright: {
    person: "#9dcfff",
    repo: "#7ee89a",
    topic: "#f0c45a",
    org: "#d8b4fe",
  },
  linkColors: {
    owns: "#58a6ff",
    contributes: "#8b949e",
    follows: "#da70d6",
  },
  defaultNodeColor: "#8b949e",
  defaultLinkColor: "#8b949e",
  backgroundColor: "#030810",
  palette: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7"],
};
```

### ThemeConfig 레퍼런스

| 속성 | 타입 | 설명 |
|------|------|------|
| `nodeColors` | `Record<string, string>` | `node.type`별 노드 색상 |
| `nodeColorsBright` | `Record<string, string>` | 하이라이트용 밝은 색상 변형 (생략 시 자동 생성) |
| `linkColors` | `Record<string, string>` | `link.type`별 엣지 색상 |
| `defaultNodeColor` | `string` | 매핑되지 않은 노드 타입의 기본 색상 |
| `defaultLinkColor` | `string` | 매핑되지 않은 링크 타입의 기본 색상 |
| `backgroundColor` | `string` | 씬 배경 색상 |
| `palette` | `string[]` | 명시적 매핑이 없는 타입에 대한 자동 할당 팔레트 |

### 프리셋 테마 상세

**Celestial** (기본값) — 블루/그린/골드 톤의 우주 공간 미학.

**Neon** — 밝은 그린과 핑크의 고대비 사이버펑크 팔레트.

**Minimal** — 다크 네이비 배경 위의 차분하고 전문적인 톤.

---

## 7. 스타일 설정

모든 시각적 파라미터를 제어합니다:

```tsx
<NetworkGraph3D
  data={data}
  style={{
    nodeMinSize: 2,
    nodeMaxSize: 18,
    edgeOpacity: 0.2,
    edgeWidthScale: 1.0,
    bloomStrength: 0.7,
    bloomRadius: 0.1,
    bloomThreshold: 0.1,
    starField: true,
    fogDensity: 0.0004,
    autoOrbit: false,
    labelScale: 1.2,
    labelThreshold: 0.8,
    showLabels: true,
    maxLabels: 200,
  }}
/>
```

### StyleConfig 레퍼런스

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `nodeMinSize` | `number` | `1` | 최소 노드 구체 반경 |
| `nodeMaxSize` | `number` | `15` | 최대 노드 구체 반경 |
| `edgeOpacity` | `number` | `0.15` | 엣지 라인 불투명도 (0–1) |
| `edgeWidthScale` | `number` | `1.0` | 엣지 라인 두께 배율 |
| `bloomStrength` | `number` | `0.6` | 글로우 효과 강도 |
| `bloomRadius` | `number` | `0.1` | 글로우 확산 반경 |
| `bloomThreshold` | `number` | `0.1` | 글로우의 밝기 임계값 |
| `starField` | `boolean` | `true` | 배경 별 파티클 표시 |
| `fogDensity` | `number` | `0.0006` | 지수 안개 밀도 (0 = 비활성) |
| `autoOrbit` | `boolean` | `false` | 카메라 자동 회전 |
| `labelScale` | `number` | `1.0` | 라벨 텍스트 크기 배율 |
| `labelThreshold` | `number` | `0.8` | 라벨 가시 거리 (0–1) |
| `showLabels` | `boolean` | `true` | 라벨 표시 여부 |
| `maxLabels` | `number` | `150` | 동시에 표시되는 최대 라벨 수 |

> **참고:** `edgeWidthScale`은 `THREE.LineBasicMaterial`의 `linewidth`로 적용됩니다. WebGL 제한으로 인해 대부분의 플랫폼에서 `linewidth: 1`만 지원됩니다. 실제 가변 너비 라인이 필요한 경우 커스텀 후처리 방식을 고려하세요.

---

## 8. 레이아웃 설정

포스 디렉티드 레이아웃은 Web Worker에서 실행됩니다 (메인 스레드 비차단):

```tsx
<NetworkGraph3D
  data={data}
  layout={{
    type: "force-3d",
    charge: "auto",        // 또는 -200 같은 숫자
    linkDistance: "auto",   // 또는 250 같은 숫자
    alphaDecay: "auto",    // 또는 0.02 같은 숫자
    velocityDecay: 0.4,
    settledThreshold: 0.005,
  }}
/>
```

### LayoutConfig 레퍼런스

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `type` | `"force-3d"` | `"force-3d"` | 레이아웃 알고리즘 |
| `charge` | `"auto" \| number` | `"auto"` | 다체 힘 강도 (음수 = 반발) |
| `linkDistance` | `"auto" \| number` | `"auto"` | 연결된 노드 간 이상적 거리 |
| `alphaDecay` | `"auto" \| number` | `"auto"` | 시뮬레이션 냉각 속도 |
| `velocityDecay` | `number` | `0.4` | 속도 감쇠 (0–1) |
| `settledThreshold` | `number` | `0.005` | 레이아웃 안정화 판단 알파 임계값 |

### 자동 적응 파라미터

`"auto"`로 설정하면 노드 수에 따라 파라미터가 자동 조절됩니다:

| 파라미터 | n ≤ 10,000 | 10,000 < n ≤ 50,000 | n > 50,000 |
|----------|------------|----------------------|------------|
| `charge` | -200 | -120 | -80 |
| `linkDistance` | 250 | 180 | 120 |
| `alphaDecay` | 0.02 | 0.03 | 0.04 |

이를 통해 다양한 그래프 크기에서 우수한 성능과 시각적 품질을 보장합니다.

---

## 9. 렌더러 설정

```tsx
<NetworkGraph3D
  data={data}
  renderer={{
    antialias: false,     // 기본값: false (성능 우선)
    pixelRatioMax: 1.5,   // 디바이스 픽셀 비율 상한
  }}
/>
```

| 속성 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `antialias` | `boolean` | `false` | WebGL 안티앨리어싱 |
| `pixelRatioMax` | `number` | `1.5` | 최대 디바이스 픽셀 비율 |

---

## 10. 노드 상세 패널

노드 상세 정보, 연결 목록, 3D 이웃 서브그래프를 보여주는 모달 패널:

```tsx
import { NetworkGraph3D, NodeDetailPanel, type GraphNode } from "graphier";

function App() {
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
  const graphRef = useRef<NetworkGraph3DRef>(null);

  return (
    <>
      <NetworkGraph3D
        ref={graphRef}
        data={data}
        onNodeDoubleClick={(node) => setDetailNode(node)}
      />

      {detailNode && (
        <NodeDetailPanel
          node={detailNode}
          data={data}
          theme="celestial"
          onClose={() => setDetailNode(null)}
          onNodeNavigate={(node) => {
            setDetailNode(null);
            graphRef.current?.focusNode(node.id);
          }}
          maxHops={3}
          maxNodes={100}
          modal={true}
          renderNodeMeta={(node) => (
            <div>커스텀 메타데이터: {node.type}</div>
          )}
          connectionSecondary={(node) => (
            <span>{node.val} 연결</span>
          )}
          labelFormatter={(node) => node.label ?? node.id}
        />
      )}
    </>
  );
}
```

### NodeDetailPanelProps 레퍼런스

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `node` | `GraphNode` | **(필수)** | 표시할 노드 |
| `data` | `GraphData` | **(필수)** | 전체 그래프 데이터 |
| `onClose` | `() => void` | **(필수)** | 닫기 핸들러 |
| `onNodeNavigate` | `(node: GraphNode) => void` | **(필수)** | 메인 그래프에서 노드로 이동 |
| `theme` | `ThemeConfig \| string` | — | 테마 설정 또는 프리셋 이름 |
| `adjacencyMap` | `Map<string, string[]>` | — | 사전 계산된 인접 맵 (생략 시 내부 계산) |
| `labelFormatter` | `(node: GraphNode) => string` | — | 커스텀 라벨 포맷터 |
| `maxHops` | `number` | `3` | 서브그래프 깊이 |
| `maxNodes` | `number` | `250` | 서브그래프 최대 노드 수 |
| `renderNodeMeta` | `(node: GraphNode) => ReactNode` | — | 커스텀 메타데이터 섹션 |
| `groupConnections` | `(neighbors, links) => ConnectionGroup[]` | — | 커스텀 연결 그룹핑 |
| `connectionLabel` | `(node: GraphNode) => string` | — | 연결 항목별 커스텀 라벨 |
| `connectionSecondary` | `(node: GraphNode) => ReactNode` | — | 연결 항목별 부가 정보 |
| `modal` | `boolean` | `true` | 모달 오버레이로 렌더링 |
| `className` | `string` | — | 컨테이너 CSS 클래스 |
| `style` | `CSSProperties` | — | 컨테이너 CSS 스타일 |

### 네비게이션 동작

- **단일 클릭** (서브그래프 내 노드) → 모달 **내부**에서 이동 (내부 히스토리)
- **더블 클릭** (서브그래프 내 노드) → 모달 닫고 `onNodeNavigate`로 **메인 그래프**에서 이동
- 모달 헤더의 **뒤로/앞으로 버튼**으로 네비게이션 히스토리 탐색
- **Escape** 또는 오버레이 클릭 → 모달 닫기
- **연결 목록 클릭** → 모달 내부에서 이동

---

## 11. 2D 서브그래프 뷰

경량 2D 서브그래프 렌더러 (캔버스 기반, Three.js 오버헤드 없음):

```tsx
import { SubgraphView2D } from "graphier";

<SubgraphView2D
  data={data}
  centerNodeId="alice"
  maxHops={2}
  maxNodes={50}
  theme="celestial"
  onNodeClick={(node) => console.log(node)}
  style={{ width: 400, height: 300 }}
/>
```

### SubgraphView2DProps 레퍼런스

| Prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `data` | `GraphData` | **(필수)** | 전체 그래프 데이터 |
| `centerNodeId` | `string` | **(필수)** | 서브그래프 추출의 중심 노드 |
| `maxHops` | `number` | `3` | 서브그래프 깊이 |
| `maxNodes` | `number` | `250` | 최대 노드 수 |
| `theme` | `ThemeConfig \| string` | — | 테마 설정 또는 프리셋 이름 |
| `onNodeClick` | `(node: GraphNode) => void` | — | 클릭 핸들러 |
| `onNodeHover` | `(node: GraphNode \| null) => void` | — | 호버 핸들러 |
| `labelFormatter` | `(node: GraphNode) => string` | — | 커스텀 라벨 |
| `style` | `CSSProperties` | — | 컨테이너 CSS |
| `className` | `string` | — | 컨테이너 클래스 |

---

## 12. 그래프 분석 모듈

Three.js 의존성이 **전혀 없는** 트리 셰이킹 가능한 분석 모듈:

```tsx
import { analyzeGraph } from "graphier/analysis";

const stats = analyzeGraph(data);

console.log(stats.nodeCount);      // 1500
console.log(stats.linkCount);      // 4200
console.log(stats.density);        // 0.0037
console.log(stats.avgDegree);      // 5.6
console.log(stats.maxDegree);      // 42
console.log(stats.minDegree);      // 1
console.log(stats.nodesByType);    // { person: 500, repo: 800, topic: 200 }
console.log(stats.linksByType);    // { owns: 1000, contributes: 2500, ... }
console.log(stats.topByDegree(5)); // 연결 수 기준 상위 5개 노드
```

### 개별 함수

```tsx
import {
  computeDegreeMap,
  computeDegreeStats,
  topByDegree,
  computeDensity,
  computeLinkTypeBreakdown,
  findHubs,
  groupByType,
  buildAdjacencyMap,
  getNeighbors,
} from "graphier/analysis";

// 차수 분석
const degreeMap = computeDegreeMap(data);         // { nodeId: degree }
const stats = computeDegreeStats(degreeMap);       // { min, max, avg, total }
const top10 = topByDegree(data.nodes, degreeMap, 10);

// 밀도
const density = computeDensity(data.nodes.length, data.links.length);

// 링크 유형 분석
const breakdown = computeLinkTypeBreakdown(data.links); // { type: count }

// 허브 찾기 (차수 >= 임계값인 노드)
const hubs = findHubs(data.nodes, degreeMap, 10);

// 타입 분포
const byType = groupByType(data.nodes);  // { type: count }

// 인접성 및 이웃 탐색
const adjacencyMap = buildAdjacencyMap(data.links);
const neighbors = getNeighbors(adjacencyMap, "alice", 3); // Map<nodeId, hopDistance>
```

---

## 13. 키보드 컨트롤

그래프 컨테이너에 포커스가 있을 때 (그래프 아무 곳이나 클릭):

| 키 | 동작 |
|----|------|
| `Z` | 줌 인 |
| `X` | 줌 아웃 |
| `←` 왼쪽 화살표 | 카메라 왼쪽 회전 (방위각) |
| `→` 오른쪽 화살표 | 카메라 오른쪽 회전 (방위각) |
| `↑` 위쪽 화살표 | 카메라 위쪽 회전 (극각) |
| `↓` 아래쪽 화살표 | 카메라 아래쪽 회전 (극각) |
| `Escape` | 현재 노드 선택 해제 |

**360도 회전**: 카메라는 완전한 구면 회전을 지원합니다 — 짐벌 잠금 없음, 각도 제한 없음. 카메라의 "up" 벡터가 극 회전 쿼터니언과 함께 공동 회전하여 극점을 부드럽게 통과할 수 있습니다.

**컨테이너 범위 이벤트**: 키보드 이벤트는 그래프 컨테이너 요소에 스코프됩니다. 같은 페이지의 여러 그래프 인스턴스가 서로 간섭하지 않습니다.

---

## 14. 증분 데이터 업데이트

전체 리빌드 없이 라이브 그래프에 노드와 링크를 추가합니다:

```tsx
const graphRef = useRef<NetworkGraph3DRef>(null);

async function handleExpandNode(nodeId: string) {
  // API에서 이웃 노드 가져오기
  const { newNodes, newLinks } = await fetchNeighbors(nodeId);

  // 라이브 그래프에 추가 — 기존 노드 위치는 보존됨
  const added = graphRef.current?.appendData(newNodes, newLinks);
  console.log(`${added}개의 새 노드 추가됨`);
}
```

**동작 방식:**
1. 새 노드는 ID로 중복 제거됩니다 (기존 노드는 건너뜀)
2. 새 링크가 그래프에 병합됩니다
3. 기존 노드 위치는 `initialPositions` 메커니즘을 통해 보존됩니다
4. 새 노드는 그래프 중심 근처에 랜덤 배치됩니다
5. 포스 시뮬레이션이 재시작되어 새 노드를 통합합니다
6. 전체 메시 해체/리빌드가 발생하지 않습니다

**위치 보존**: `data` prop이 전체적으로 변경될 때, 기존 노드 위치가 해체 전에 저장되고 레이아웃 워커에 `initialPositions`로 전달됩니다:
- 데이터셋 전환 시 공유 노드의 위치가 보존됩니다
- `appendData`를 통한 추가 시 모든 기존 위치가 보존됩니다
- 완전히 새로운 노드만 랜덤 초기 위치를 받습니다

---

## 15. 고급 패턴

### 검색 및 포커스

```tsx
function SearchBox({ graphRef }: { graphRef: RefObject<NetworkGraph3DRef> }) {
  const [query, setQuery] = useState("");

  async function handleSearch() {
    const results = await api.search(query);
    if (results.length > 0) {
      graphRef.current?.focusNode(results[0].id, 1200);
    }
  }

  return <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} />;
}
```

### 클릭 시 노드 데이터 보강

```tsx
async function handleNodeClick(node: GraphNode | null) {
  if (!node) return;

  // API에서 보강된 데이터 가져오기
  const enriched = await api.getNode(node.id);

  setSelectedNode({ ...node, ...enriched });
}
```

### 스타일 컨트롤 패널

```tsx
function StylePanel({ style, onChange }) {
  return (
    <div>
      <label>
        블룸: <input type="range" min={0} max={2} step={0.1}
          value={style.bloomStrength}
          onChange={(e) => onChange({ ...style, bloomStrength: +e.target.value })}
        />
      </label>
      <label>
        안개: <input type="range" min={0} max={0.002} step={0.0001}
          value={style.fogDensity}
          onChange={(e) => onChange({ ...style, fogDensity: +e.target.value })}
        />
      </label>
      <label>
        라벨: <input type="checkbox" checked={style.showLabels}
          onChange={(e) => onChange({ ...style, showLabels: e.target.checked })}
        />
      </label>
    </div>
  );
}

function App() {
  const [style, setStyle] = useState({
    bloomStrength: 0.6,
    fogDensity: 0.0006,
    showLabels: true,
  });

  return (
    <>
      <StylePanel style={style} onChange={setStyle} />
      <NetworkGraph3D data={data} style={style} />
    </>
  );
}
```

### 스크린샷

```tsx
async function handleScreenshot() {
  const blob = await graphRef.current?.screenshot();
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph-screenshot.png";
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

### 전체화면 토글

```tsx
function toggleFullscreen(containerRef: RefObject<HTMLDivElement>) {
  const el = containerRef.current;
  if (!el) return;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    el.requestFullscreen();
  }
}
```

### Three.js 씬 접근

```tsx
// 씬에 커스텀 오브젝트 추가
const scene = graphRef.current?.getScene();
if (scene) {
  const geometry = new THREE.BoxGeometry(10, 10, 10);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);
}
```

---

## 16. Next.js / SSR 설정

Graphier는 브라우저 API가 필요한 Three.js를 사용합니다. Next.js의 경우:

### 동적 임포트 (권장)

```tsx
// app/page.tsx
"use client";

import dynamic from "next/dynamic";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

export default function Page() {
  return <GraphView />;
}
```

```tsx
// app/GraphView.tsx
"use client";

import { NetworkGraph3D } from "graphier";

export default function GraphView() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <NetworkGraph3D data={data} />
    </div>
  );
}
```

### next.config.js

Turbopack을 사용하는 Next.js의 경우 `transpilePackages`에 `graphier`를 추가하세요:

```js
// next.config.js
const nextConfig = {
  transpilePackages: ["graphier"],
};
export default nextConfig;
```

---

## 17. 타입 레퍼런스

### 전체 Export 목록

```typescript
// 컴포넌트
export { NetworkGraph3D } from "graphier";
export { NodeDetailPanel } from "graphier";
export { SubgraphView2D } from "graphier";

// 타입
export type {
  GraphNode,
  GraphLink,
  GraphData,
  PositionedNode,
  ThemeConfig,
  StyleConfig,
  LayoutConfig,
  RendererConfig,
  NetworkGraph3DRef,
  NetworkGraph3DProps,
  NodeDetailPanelProps,
  SubgraphView2DProps,
  SubgraphResult,
  SubgraphOptions,
  ConnectionGroup,
  NodeEventHandler,
  NullableNodeEventHandler,
  LinkEventHandler,
  BackgroundClickHandler,
  ResolvedTheme,
} from "graphier";

// 상수 및 유틸리티
export {
  DEFAULT_STYLE,
  DEFAULT_LAYOUT,
  celestial,
  neon,
  minimal,
  resolveTheme,
  buildSubgraph,
  animateCamera,
  zoomToFitPositions,
  buildAdjacencyMapFromLinks,
  computeHighlightSet,
} from "graphier";

// 분석 (트리 셰이킹 가능, 별도 엔트리 포인트)
export {
  analyzeGraph,
  computeDegreeMap,
  computeDegreeStats,
  topByDegree,
  computeDensity,
  computeLinkTypeBreakdown,
  computeNodeLinkCounts,
  findHubs,
  groupByType,
  buildAdjacencyMap,
  getNeighbors,
} from "graphier/analysis";
```

---

## 18. 성능 관련 참고사항

### 렌더링 아키텍처

- **총 2회 GPU 드로우 콜**: 모든 노드를 위한 1개 InstancedMesh + 모든 엣지를 위한 1개 LineSegments
- **커스텀 GLSL 셰이더**: 노드의 프레넬 림 글로우 + 서브서피스 스캐터
- **Web Worker 레이아웃**: 전송 가능한 `Float32Array`를 통해 메인 스레드 외부에서 포스 시뮬레이션 실행
- **적응형 LOD**: 구체 세그먼트 수가 그래프 크기에 따라 조절 (16/12/8 세그먼트)

### 자동 적응 최적화

렌더러가 그래프 크기에 따라 자동으로 조절됩니다:

| 그래프 크기 | 블룸 | 안개 | 엣지 불투명도 | LOD |
|------------|------|------|-------------|-----|
| < 5,000 | 풀 | 풀 | 0.15 | 16 세그먼트 |
| 5,000–15,000 | 해상도 감소 | 감소 | 낮음 | 12 세그먼트 |
| > 15,000 | 최소 | 비활성 | 최소 | 8 세그먼트 |

### 대규모 그래프 팁

- `renderer.antialias`를 `false`로 설정 (기본값)
- 50k+ 노드 그래프에서 `style.maxLabels` 줄이기
- `layout.charge = "auto"`로 시스템 자동 조절 허용
- 매우 큰 그래프에서 `style.fogDensity = 0` 설정
- `graphier/analysis` 모듈은 Three.js 의존성이 전혀 없음 — 서버 사이드 사용 가능

---

## 라이센스

MIT
