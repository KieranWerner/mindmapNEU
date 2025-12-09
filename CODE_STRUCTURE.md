# Mindmap App - Code-Struktur

## Neu organisierte Dateistruktur

Die App wurde in logische Module aufgeteilt:

```
src/
├── types/
│   └── index.ts              # Alle TypeScript-Typen (MindNode, Link, Snapshot, etc.)
├── constants/
│   └── index.ts              # App-Konstanten (STORAGE_KEY, BASE_W, BASE_H, etc.)
├── utils/
│   ├── math.ts               # Mathematische Hilfsfunktionen
│   ├── layout.ts             # Layout-Berechnungen für Nodes
│   └── snapshot.ts           # Snapshot-Utilities
├── components/
│   ├── MenuItem.tsx          # Kontextmenü-Eintrag Komponente
│   ├── HelpButton.tsx        # Hilfe-Button mit Shortcuts
│   ├── Toolbar.tsx           # Toolbar mit Export/Import
│   └── ContextMenu.tsx       # Kontextmenü-Komponente
├── hooks/
│   └── useMindMap.ts         # Custom Hook für Mindmap-Logik
└── App.tsx                   # Hauptkomponente (wird refactored)

```

## Vorteile der neuen Struktur

### 1. **Typen** (`src/types/`)
- Zentrale Definition aller TypeScript-Typen
- Bessere Wiederverwendbarkeit
- Einfachere Typ-Konsistenz

### 2. **Konstanten** (`src/constants/`)
- Alle Konfigurationswerte an einem Ort
- Einfache Anpassung von Defaults

### 3. **Utils** (`src/utils/`)
- **math.ts**: Mathematische Berechnungen (Distanzen, Schnittpunkte, etc.)
- **layout.ts**: Text-Layout und Node-Größenberechnung
- **snapshot.ts**: Undo/Redo-Funktionalität

### 4. **Components** (`src/components/`)
- Wiederverwendbare UI-Komponenten
- Jede Komponente in eigener Datei
- Props klar definiert

### 5. **Hooks** (`src/hooks/`)
- `useMindMap`: Zentraler Hook für State-Management
- Kapselt komplexe Logik

## Nächste Schritte

Die App.tsx ist noch sehr groß (~1147 Zeilen). Um sie vollständig zu refactoren:

1. **Event-Handler auslagern** → `src/hooks/useEventHandlers.ts`
2. **Render-Logik trennen** → `src/components/MindMapCanvas.tsx`
3. **Keyboard-Handler** → `src/hooks/useKeyboardShortcuts.ts`
4. **File I/O** → `src/utils/fileOperations.ts`

## Verwendung

Die neuen Module sind bereits verwendbar:

```typescript
import type { MindNode, Link } from './types';
import { BASE_W, BASE_H } from './constants';
import { layoutLabel, resizeNodeForLabel } from './utils/layout';
import { HelpButton } from './components/HelpButton';
import { Toolbar } from './components/Toolbar';
import { ContextMenu } from './components/ContextMenu';
```

Die ursprüngliche App.tsx funktioniert weiterhin, nutzt aber die neuen Module noch nicht vollständig.
