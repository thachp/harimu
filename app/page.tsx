'use client';

import type { VerificationState } from '@/lib/verification';
import type { SimulationState } from '@/lib/world-simulation';

import { GuestDemo, type GuestDemoView } from './guest-demo';
import { FirstVisitGuide, type FirstVisitStage } from './first-visit-guide';
import { GlobeTour } from './globe-tour';
import { CountryScene } from './country-scene';
import { capitalCityForNation, cityForNation } from '@/lib/cities';
import type { CityLocation } from '@/lib/city-location';
import { NationComparison } from './nation-strip-filters';
import { createGuestDemo, guestDemoAction, type GuestDemoAction } from '@/lib/guest-demo';
import { canReadSharedWorld } from '@/lib/guest-access';
import { readCitizenIntents, writeCitizenIntents } from '@/lib/citizen-session';
import { isSceneTraversal, sceneHistoryState, sceneFromSearch, nationFromSearch, sceneUrl, type SceneView } from '@/lib/scene-navigation';
import { useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { SceneNews } from './world-scene';
import { firstLoopStep } from '@/lib/first-loop';
import { CitizenshipDialog } from './citizenship-dialog';
import { GameShell } from './game-shell';
import { NationInstitutions } from './nation-institutions';
import { SquareChat } from './square-chat';
import { DailyLoop } from './daily-loop';
import { AurellePlanPanel, type AurellePlanView, type AurelleCommand, type AurelleAction } from './aurelle-plan-panel';
import { KorundPlanPanel, PriorNationShift, type KorundPlanView, type KorundCommand, type KorundAction } from './korund-plan-panel';
import { GovernmentPanel } from './government-panel';
import { simulateGovernment, type GovernmentSnapshot, type PetitionTopic } from '@/lib/government';
import { PlayerMarket } from './player-market';
import { validPlayerCommand, type PlayerCommand, type PlayerMarketState } from '@/lib/player-market';
import { CitizenMarket } from './citizen-market';
import { marketSeeds, validMarketCommand, type MarketState, type MarketCommand } from '@/lib/market';
import { WorkShiftBoard } from './work-shift-board';
import { shiftRules, type WorkShift } from '@/lib/work-shifts';
import { rewards, recoverySeconds, maximumCapacity, type Economy } from '@/lib/economy';
import {
  Show,
  SignInButton,
  UserButton,
  useUser,
} from '@clerk/nextjs';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { clerkConfigured } from './providers';

type ViewMode = SceneView;
type PlanHorizon = 'today' | 'week' | 'season';

type Nation = {
  id: string;
  name: string;
  shortName: string;
  government: string;
  economy: string;
  currency: string;
  religion: string;
  capital: string;
  population: string;
  treasury: string;
  stability: number;
  color: string;
  softColor: string;
  motto: string;
  tradeStatus: string;
  position: { x: number; y: number };
};

type WorkOrder = {
  id: string;
  nationId?: string | null;
  name: string;
  detail: string;
  cost: number;
};

type PlanningTask = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  effects: {
    capacity: number;
    influence: number;
    water: number;
    stability: number;
  };
  outcome: string;
  infrastructureId: string;
  householdMemberId: string;
};

type CitizenDecision = {
  decisionId: string;
  optionId: string;
  infrastructureId: string;
  householdMemberId: string;
  effects: PlanningTask['effects'];
  outcome: string;
  committedAt: string;
};

type CitizenshipStatus = {
  enrolledAt: string;
  graceEndsAt: string | null;
  changesRemaining: number;
  politicalActionTaken: boolean;
  canChange: boolean;
  lockedReason: 'political-action' | 'change-used' | 'grace-expired' | null;
};

type DecisionCommitInput = {
  optionId: string;
  infrastructureId: string;
  householdMemberId: string;
};

type WorldEvent = {
  id: number;
  kind: string;
  headline: string;
  detail: string;
  location: string | null;
  occurredAt: string;
};

const fallbackNations: Nation[] = [
  {
    id: 'kindle',
    name: 'Kindle Republic',
    shortName: 'Kindle',
    government: 'Liberal democracy',
    economy: 'Market capitalism',
    currency: 'Spark (SPK) · free float',
    religion: 'Secular pluralism',
    capital: 'Forgehaven',
    population: '1.42m',
    treasury: 'SPK 86.4m',
    stability: 78,
    color: '#cf4b32',
    softColor: '#edc1b8',
    motto: 'Anyone can rise - and anyone can fall.',
    tradeStatus: 'Open exchange',
    position: { x: 85, y: 67 },
  },
  {
    id: 'confluence',
    name: 'The Confluence',
    shortName: 'Confluence',
    government: 'Single-party socialist state',
    economy: 'Socialist-oriented market',
    currency: 'Current (CUR) · managed band',
    religion: 'Registered faiths',
    capital: 'Meetwater',
    population: '1.16m',
    treasury: 'CUR 61.8m',
    stability: 83,
    color: '#2776a6',
    softColor: '#b7d4e5',
    motto: 'Many rivers, one current.',
    tradeStatus: 'Managed band',
    position: { x: 50, y: 88 },
  },
  {
    id: 'meridian',
    name: 'Meridian',
    shortName: 'Meridian',
    government: 'Party-state',
    economy: 'State capitalism with SEZs',
    currency: 'Gauge (GAU) · crawling peg',
    religion: 'State-supervised associations',
    capital: 'Steamgate',
    population: '1.87m',
    treasury: 'GAU 103.1m',
    stability: 86,
    color: '#a1639c',
    softColor: '#dec7dc',
    motto: 'Order today, prosperity tomorrow.',
    tradeStatus: 'SEZ convertibility',
    position: { x: 72, y: 82 },
  },
  {
    id: 'korund',
    name: 'Korund',
    shortName: 'Korund',
    government: 'Full communism; leader for life',
    economy: 'Central planning',
    currency: 'Labor Note (LN) + ration coupons',
    religion: 'State atheism',
    capital: 'Stonehearth',
    population: '1.31m',
    treasury: 'LN 58.2m',
    stability: 68,
    color: '#75654e',
    softColor: '#d3cabd',
    motto: 'Nobody falls through the stone.',
    tradeStatus: 'State bureau only',
    position: { x: 14, y: 45 },
  },
  {
    id: 'aurelle',
    name: 'Aurelle',
    shortName: 'Aurelle',
    government: 'Absolute hereditary monarchy',
    economy: 'Royal charters and fiefs',
    currency: 'Crown (CRN) · gold-backed',
    religion: 'Kinward Rite state church',
    capital: 'Highspire',
    population: '924k',
    treasury: 'CRN 74.6m',
    stability: 72,
    color: '#94afbf',
    softColor: '#d9e2e8',
    motto: "Win the crown's favor - or take the crown.",
    tradeStatus: 'Royal charter',
    position: { x: 72, y: 28 },
  },
  {
    id: 'ilmar',
    name: 'Ilmar Sanctum',
    shortName: 'Ilmar',
    government: 'Theocracy',
    economy: 'Endowment economy',
    currency: 'Prism (PRM) · Canon rules',
    religion: 'Lumen Canon theocracy',
    capital: 'Mirrorhall',
    population: '778k',
    treasury: 'PRM 48.9m',
    stability: 75,
    color: '#d3a72f',
    softColor: '#efe1af',
    motto: 'Every duty is a step toward the light.',
    tradeStatus: 'Clear Measure',
    position: { x: 28, y: 82 },
  },
  {
    id: 'hoarvale',
    name: 'Hoarvale',
    shortName: 'Hoarvale',
    government: 'Constitutional monarchy',
    economy: 'Coordinated market',
    currency: 'Rime (RIM) · inflation band',
    religion: 'Ceremonial Kinward establishment',
    capital: 'Rimehall',
    population: '1.09m',
    treasury: 'RIM 79.3m',
    stability: 81,
    color: '#45a7b8',
    softColor: '#bee0e5',
    motto: 'The Crown endures; governments answer to you.',
    tradeStatus: 'Open exchange',
    position: { x: 50, y: 20 },
  },
  {
    id: 'varkand',
    name: 'Varkand',
    shortName: 'Varkand',
    government: 'Military junta',
    economy: 'Arsenal command economy',
    currency: 'Ward (WRD) · hard peg',
    religion: 'Regulated tolerance',
    capital: 'Watchfast',
    population: '846k',
    treasury: 'WRD 52.6m',
    stability: 70,
    color: '#526b68',
    softColor: '#c5d0ce',
    motto: 'Order first. Everything else after.',
    tradeStatus: 'Alert-dependent',
    position: { x: 28, y: 28 },
  },
  {
    id: 'veldwood',
    name: 'Veldwood',
    shortName: 'Veldwood',
    government: 'Federal direct democracy',
    economy: 'Social democracy',
    currency: 'Bough (BGH) · Citizen Dividend',
    religion: 'Secular pluralism',
    capital: 'Ringhall',
    population: '1.04m',
    treasury: 'BGH 76.2m',
    stability: 84,
    color: '#5b8d42',
    softColor: '#c9dcbf',
    motto: 'Every voice, every season.',
    tradeStatus: 'Open exchange',
    position: { x: 14, y: 65 },
  },
  {
    id: 'fulmara',
    name: 'Fulmara',
    shortName: 'Fulmara',
    government: 'Mercantile oligarchic republic',
    economy: 'Chartered-company capitalism',
    currency: 'Charge (CHG) · shareholder bank',
    religion: 'Chartered pluralism',
    capital: 'Arcport',
    population: '1.22m',
    treasury: 'CHG 91.7m',
    stability: 74,
    color: '#6440a0',
    softColor: '#cbbde1',
    motto: 'Fortune is the franchise.',
    tradeStatus: 'Open exchange',
    position: { x: 86, y: 46 },
  },
];

function graceDeadlineLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function citizenshipRuleLabel(status: CitizenshipStatus | null) {
  if (!status) return 'One citizen · one nation';
  if (status.canChange && status.graceEndsAt) return `One free change available until ${graceDeadlineLabel(status.graceEndsAt)}`;
  if (status.lockedReason === 'political-action') return 'Locked by your first political action';
  if (status.lockedReason === 'change-used') return 'Your one free change has been used';
  if (status.lockedReason === 'grace-expired') return 'The 48-hour grace period has ended';
  return 'One citizen · one nation';
}

const fallbackWorkOrders: WorkOrder[] = [
  { id: 'harvest', nationId: 'kindle', name: 'Support the savanna harvest', detail: '+480 food · resolves in 2h', cost: 4 },
  { id: 'freight', nationId: 'kindle', name: 'Move a foundry convoy', detail: '+210 materials · resolves in 4h', cost: 6 },
  { id: 'archive', nationId: 'kindle', name: 'Catalogue the civic archive', detail: '+95 knowledge · resolves in 3h', cost: 3 },
];

const fallbackPlanningItems: PlanningTask[] = [
  {
    id: 'capacity',
    title: 'Commit Work Capacity',
    detail: 'Reserve 6 WC for the Forgehaven East harvest crews.',
    meta: '6 WC · before 20:00',
    effects: { capacity: -6, influence: 20, water: 4, stability: 1 },
    outcome: 'Harvest crews reinforce the intake before the storm, protecting tomorrow’s reserve.',
    infrastructureId: 'waterworks',
    householdMemberId: 'citizen',
  },
  {
    id: 'forum',
    title: 'Attend the district forum',
    detail: 'Hear arguments on the eastern waterworks proposal.',
    meta: 'Civic · 21:30',
    effects: { capacity: -2, influence: 80, water: 3, stability: 3 },
    outcome: 'The household joins the forum and keeps emergency repair funding open.',
    infrastructureId: 'council',
    householdMemberId: 'partner',
  },
  {
    id: 'ballot',
    title: 'Review the trade ballot',
    detail: 'Compare the open-corridor and licensed-market measures.',
    meta: 'Vote closes in 2d',
    effects: { capacity: 0, influence: 50, water: 1, stability: 2 },
    outcome: 'The household completes the trade review, improving the route for replacement pump parts.',
    infrastructureId: 'depot',
    householdMemberId: 'apprentice',
  },
];

const fallbackWorldEvents: WorldEvent[] = [
  { id: 1, occurredAt: 'Today · 20:00', headline: 'Example: harvest sign-up deadline', kind: 'Work', detail: 'Sample story: workers reserve energy for tomorrow’s savanna harvest. This is not an active job deadline.', location: 'Forgehaven' },
  { id: 2, occurredAt: 'Day 43 · 09:00', headline: 'District assembly session', kind: 'Civic', detail: 'The eastern waterworks proposal enters public debate.', location: 'Forgehaven East' },
  { id: 3, occurredAt: 'Day 45 · 18:00', headline: 'Trade corridor vote', kind: 'Ballot', detail: 'Citizens decide the Kindle-Confluence corridor mandate.', location: 'Kindle Assembly' },
];

function subscribeToLocation(onStoreChange: () => void) {
  const pathname = window.location.pathname;
  // These query-only entries belong to the game, not the framework's RSC router.
  // Restoring an RSC snapshot here remounts the citizen session and the viewport.
  if (!isSceneTraversal(window.history.state, pathname)) {
    window.history.replaceState(sceneHistoryState(window.history.state, pathname), '');
  }
  const onPopState = (event: PopStateEvent) => {
    if (window.location.pathname === pathname && isSceneTraversal(event.state, pathname)) {
      event.stopImmediatePropagation();
      window.dispatchEvent(new Event('harimu-scenechange'));
    } else onStoreChange();
  };
  window.addEventListener('popstate', onPopState, true);
  window.addEventListener('harimu-scenechange', onStoreChange);
  return () => { window.removeEventListener('popstate', onPopState, true); window.removeEventListener('harimu-scenechange', onStoreChange); };
}

function getLocationSearch() {
  return window.location.search;
}

function ClerkAccountControl() {
  if (!clerkConfigured) return <span className="account-demo-label">Local demo</span>;

  return (
    <div className="account-control">
      {process.env.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW === 'true' && <span className="development-preview-label" title="Fresh development world. Production progress is separate.">Development preview</span>}
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="account-sign-in" type="button">Sign in</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              avatarBox: { display: 'none' },
              userButtonTrigger: 'harimu-auth-trigger account-menu-trigger',
            },
          }}
        />
      </Show>
    </div>
  );
}

type CitizenSnapshot = {
  profile: {
    nationId: string | null;
    displayName: string | null;
    capacity: number;
    influence: number;
    standing: string;
    waterSecurity: number;
    wardStability: number;
    citizenship: CitizenshipStatus;
  } | null;
  plan: { horizon: PlanHorizon; note: string; completedIds: string[] } | null;
  decision: CitizenDecision | null;
  shifts: WorkShift[];
  economy?: Economy;
  market?: MarketState;
  playerMarket?: PlayerMarketState;
  government?: GovernmentSnapshot | null;
  verification?: VerificationState;
  simulation?: SimulationState;
  aurellePlan?: AurellePlanView | null;
  korundPlan?: KorundPlanView | null;
  demoGovernment?: { period: number; counts: Record<string, number> };
  demoReceipts?: string[];
  demoStarterGranted?: boolean;
};

type EnrollmentReview = { nationId: string; expectedNationId: string | null };
const enrollmentReviewKey = (userId: string | null) => `harimu-enrollment-review-v1:${userId ?? 'anonymous'}`;
function readEnrollmentReview(userId: string | null): EnrollmentReview | null {
  try {
    const raw = window.sessionStorage.getItem(enrollmentReviewKey(userId));
    const review = raw ? JSON.parse(raw) : null;
    const known = (id: unknown) => typeof id === 'string' && fallbackNations.some(nation => nation.id === id);
    return review && known(review.nationId) && (review.expectedNationId === null || known(review.expectedNationId))
      ? { nationId: review.nationId, expectedNationId: review.expectedNationId } : null;
  } catch { return null; }
}
function writeEnrollmentReview(userId: string | null, review: EnrollmentReview | null) {
  try {
    const key = enrollmentReviewKey(userId);
    if (review) window.sessionStorage.setItem(key, JSON.stringify(review));
    else window.sessionStorage.removeItem(key);
  } catch { /* A review can still be completed with storage disabled. */ }
}

type CitizenSessionStatus = 'loading' | 'anonymous' | 'ready' | 'error';

function ClerkCitizenSession({
  onHydrate,
  onStatus,
  onIdentity,
  retryKey,
}: {
  onHydrate: (snapshot: CitizenSnapshot) => void;
  onStatus: (status: CitizenSessionStatus) => void;
  onIdentity: (userId: string | null) => void;
  retryKey: number;
}) {
  const { isLoaded, user } = useUser();
  const userId = user?.id;

  useLayoutEffect(() => {
    if (!isLoaded) {
      onStatus('loading');
      return;
    }
    onIdentity(userId ?? null);
    if (!userId) {
      onStatus('anonymous');
      return;
    }
    const controller = new AbortController();
    onStatus('loading');

    async function loadCitizen() {
      try {
        const response = await fetch('/api/citizen', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          onStatus('error');
          return;
        }
        const snapshot = await response.json() as CitizenSnapshot;
        if (controller.signal.aborted) return;
        onHydrate(snapshot);
        onStatus('ready');
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') onStatus('error');
      }
    }

    void loadCitizen();
    return () => controller.abort();
  }, [isLoaded, onHydrate, onStatus, onIdentity, userId, retryKey]);

  return null;
}

export default function Home() {
  const [simulation, setSimulation] = useState<SimulationState | null>(null);
  const [aurellePlan, setAurellePlan] = useState<AurellePlanView | null>(null);
  const [aurelleCommand, setAurelleCommand] = useState<AurelleCommand | null>(null);
  const aurelleIntent = useRef<AurelleCommand | null>(null);
  const [korundPlan, setKorundPlan] = useState<KorundPlanView | null>(null);
  const [korundCommand, setKorundCommand] = useState<KorundCommand | null>(null);
  const korundIntent = useRef<KorundCommand | null>(null);
  const [worldNations, setWorldNations] = useState<Nation[]>(fallbackNations);
  const [availableWorkOrders, setAvailableWorkOrders] = useState<WorkOrder[]>(fallbackWorkOrders);
  const [availablePlanningItems, setAvailablePlanningItems] = useState<PlanningTask[]>(fallbackPlanningItems);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>(fallbackWorldEvents);
  // Vinext supplies the request query during SSR and the matching hydration snapshot.
  // Our own store still owns query-only scene history after hydration.
  const frameworkSearch = useSearchParams()?.toString() ?? '';
  const getInitialSearch = useCallback(() => frameworkSearch ? `?${frameworkSearch}` : '', [frameworkSearch]);
  const locationSearch = useSyncExternalStore(subscribeToLocation, getLocationSearch, getInitialSearch);
  const viewMode = sceneFromSearch(locationSearch);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (document.querySelector('.enrollment-dialog')) return;
      const heading = document.getElementById('game-panel-title') ?? document.querySelector<HTMLElement>('main h1');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [locationSearch]);
  const [selectedId, setSelectedId] = useState(() => nationFromSearch(locationSearch, fallbackNations.map(nation => nation.id), 'kindle'));
  const [nationFocusRevision, setNationFocusRevision] = useState(0);
  const [guestMode, setGuestMode] = useState(false);
  const [guestState, setGuestState] = useState(createGuestDemo);
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [citizenshipStatus, setCitizenshipStatus] = useState<CitizenshipStatus | null>(null);
  const [enrollmentExpectedNation, setEnrollmentExpectedNation] = useState<string | null>(null);
  const enrollmentLock = useRef(false);
  const [sessionRetry, setSessionRetry] = useState(0);
  const [reviewStorageKey, setReviewStorageKey] = useState(() => enrollmentReviewKey(null));
  const [firstVisitGuideOpen, setFirstVisitGuideOpen] = useState(true);
  const [firstVisitStage, setFirstVisitStage] = useState<FirstVisitStage>('arrival');
  const [shortlistIds, setShortlistIds] = useState<string[]>([]);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourFocusNation, setTourFocusNation] = useState<string | null>(null);
  const stopTour = useCallback(() => { setTourOpen(false); setTourFocusNation(null); }, []);
  const finishTour = useCallback(() => { setTourOpen(false); setTourFocusNation(null); setFirstVisitStage('government'); }, []);
  useEffect(() => {
    if (!tourOpen || viewMode === 'world') return;
    const frame = requestAnimationFrame(stopTour);
    return () => cancelAnimationFrame(frame);
  }, [tourOpen, viewMode, stopTour]);
  const [guideNow, setGuideNow] = useState(0);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [enrollmentPending, setEnrollmentPending] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(18);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [governmentSnapshot, setGovernment] = useState<GovernmentSnapshot | null>(null);
  const [governmentError, setGovernmentError] = useState<string | null>(null);
  const [governmentPending, setGovernmentPending] = useState(false);
  const governmentIntent = useRef<{ topic: PetitionTopic; requestId: string } | null>(null);
  const [demoGovernment, setDemoGovernment] = useState({ period: 0, counts: {} as Record<string, number> });
  const [playerMarket, setPlayerMarket] = useState<PlayerMarketState | null>(null);
  const [playerCommand, setPlayerCommand] = useState<PlayerCommand | null>(null);
  const playerIntent = useRef<PlayerCommand | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const marketIntent = useRef<MarketCommand | null>(null);
  const [marketCommand, setMarketCommand] = useState<MarketCommand | null>(null);
  const [demoReceipts, setDemoReceipts] = useState<string[]>([]);
  const [demoStarterGranted, setDemoStarterGranted] = useState(false);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [workPending, setWorkPending] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const workLock = useRef(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const hasActiveShift = workShifts.some((shift) => !shift.claimedAt);
  const [influence, setInfluence] = useState(1240);
  const [waterSecurity, setWaterSecurity] = useState(71);
  const [wardStability, setWardStability] = useState(86);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<PlanHorizon>('week');
  const [completedPlanIds, setCompletedPlanIds] = useState<string[]>(['capacity']);
  const [planSaved, setPlanSaved] = useState(false);
  const [planNote, setPlanNote] = useState('Ask the forum how the eastern waterworks will affect Forgehaven East.');
  const [committedDecision, setCommittedDecision] = useState<CitizenDecision | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [citizenSessionStatus, setCitizenSessionStatus] = useState<CitizenSessionStatus>(
    clerkConfigured ? 'loading' : 'anonymous',
  );

  const citizenIdentity = useRef<string | null>(null);
  const citizenEpoch = useRef(0);
  const [citizenSessionKey, setCitizenSessionKey] = useState(0);
  const [cityAccount, setCityAccount] = useState<{key:number;value:CityLocation & {presence:{cityId:string;present:number}[]}} | null>(null);
  const [cityError, setCityError] = useState('');
  const [cityRetry, setCityRetry] = useState(0);
  const [cityTravelPending, setCityTravelPending] = useState(false);
  const cityTravelLock = useRef(false);
  useEffect(() => {
    if (!clerkConfigured || citizenSessionStatus !== 'ready' || !citizenNationId) return;
    const controller = new AbortController();
    const epoch = citizenEpoch.current;
    const loadCity = async () => {
      try {
        const response = await fetch('/api/city', {cache:'no-store',signal:controller.signal});
        const value = await response.json() as CityLocation & {presence:{cityId:string;present:number}[];error?:string};
        if (controller.signal.aborted || epoch !== citizenEpoch.current) return;
        if (!response.ok || value.nationId !== citizenNationId || !cityForNation(value.nationId,value.currentCityId)) throw Error(value.error ?? 'City account unavailable.');
        setCityAccount({key:citizenSessionKey,value}); setCityError('');
      } catch (error) { if (!controller.signal.aborted && epoch === citizenEpoch.current) setCityError(error instanceof Error ? error.message : 'City account unavailable.'); }
    };
    void loadCity();
    const timer = viewMode === 'country' ? setInterval(() => { if (!document.hidden) void loadCity(); },15000) : undefined;
    return () => { controller.abort(); if (timer) clearInterval(timer); };
  }, [citizenSessionStatus,citizenNationId,citizenSessionKey,cityRetry,viewMode]);
  const currentCityAccount = cityAccount?.key === citizenSessionKey && cityAccount.value.nationId === citizenNationId ? cityAccount.value : null;
  const persistIntents = useCallback(() => {
    if (!clerkConfigured || !citizenIdentity.current) return;
    try { writeCitizenIntents(window.sessionStorage, citizenIdentity.current, {
      market: marketIntent.current, player: playerIntent.current, government: governmentIntent.current,
    }); } catch { /* Storage may be disabled; preserve in-memory retry. */ }
  }, []);
  const changeCitizenIdentity = useCallback((userId: string | null) => {
    if (citizenIdentity.current === userId) return;
    const previousUserId = citizenIdentity.current;
    const review = userId ? readEnrollmentReview(userId) ?? (previousUserId === null ? readEnrollmentReview(null) : null) : null;
    writeEnrollmentReview(null, null);
    if (userId && review) writeEnrollmentReview(userId, review);
    citizenIdentity.current = userId;
    setReviewStorageKey(enrollmentReviewKey(userId));
    setGuestMode(false);
    setGuestState(createGuestDemo());
    citizenEpoch.current++;
    setCitizenSessionKey(value => value + 1);
    cityTravelLock.current = false; setCityTravelPending(false); setCityAccount(null); setCityError('');
    workLock.current = false; enrollmentLock.current = false; setEnrollmentExpectedNation(review?.expectedNationId ?? null);
    setCitizenNationId(null); setCitizenshipStatus(null); setPendingEnrollment(review?.nationId ?? null);
    setCapacity(0); setInfluence(0); setWaterSecurity(0); setWardStability(0);
    setEconomy(null); setMarket(null); setPlayerMarket(null); setGovernment(null); setVerification(null); setWorkShifts([]);
    setAurellePlan(null); aurelleIntent.current = null; setAurelleCommand(null);
    setKorundPlan(null); korundIntent.current = null; setKorundCommand(null);
    setPlanNote(''); setCompletedPlanIds([]); setPlanSaved(false); setHorizon('week'); setCommittedDecision(null);
    setRecentAction(null); setWorkError(null); setGovernmentError(null); setDecisionError(null); setEnrollmentError(null);
    setWorkPending(false); setGovernmentPending(false); setDecisionPending(false); setEnrollmentPending(false);
    let saved: ReturnType<typeof readCitizenIntents> = null;
    try { saved = userId ? readCitizenIntents(window.sessionStorage, userId) : null; } catch { /* Disabled session storage. */ }
    marketIntent.current = saved?.market ?? null; playerIntent.current = saved?.player ?? null;
    governmentIntent.current = saved?.government ?? null;
    setMarketCommand(marketIntent.current); setPlayerCommand(playerIntent.current);
    try {
      const raw = userId ? window.sessionStorage.getItem(`harimu-korund-intent-v1:${userId}`) : null;
      const command = raw ? JSON.parse(raw) : null;
      if (command && ['korund-start-work', 'korund-claim-work', 'korund-redeem-ration', 'korund-household-meal'].includes(command.action)
        && typeof command.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.requestId)
        && (command.action !== 'korund-claim-work' || typeof command.shiftId === 'string')) {
        korundIntent.current = command; setKorundCommand(command);
      }
    } catch { /* Storage recovery is best-effort. */ }
    try {
      const raw = userId ? window.sessionStorage.getItem(`harimu-aurelle-intent-v1:${userId}`) : null;
      const command = raw ? JSON.parse(raw) : null;
      if (command && ['aurelle-start-work', 'aurelle-claim-work', 'aurelle-buy-food', 'aurelle-household-meal'].includes(command.action)
        && typeof command.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.requestId)
        && (command.action !== 'aurelle-claim-work' || typeof command.shiftId === 'string')) {
        aurelleIntent.current = command; setAurelleCommand(command);
      }
    } catch { /* Storage recovery is best-effort. */ }
  }, []);

  useEffect(() => {
    if (citizenIdentity.current) return;
    const review = readEnrollmentReview(null);
    if (review) queueMicrotask(() => {
      if (citizenIdentity.current) return;
      setPendingEnrollment(review.nationId);
      setEnrollmentExpectedNation(review.expectedNationId);
    });
  }, []);

  function closeEnrollmentReview() {
    writeEnrollmentReview(citizenIdentity.current, null);
    setPendingEnrollment(null);
  }

  const selected = useMemo(
    () => worldNations.find(nation => nation.id === nationFromSearch(locationSearch, worldNations.map(item => item.id), selectedId)) ?? worldNations[0],
    [locationSearch, selectedId, worldNations],
  );
  const citizenNation = worldNations.find((nation) => nation.id === citizenNationId);
  const demoGovernmentSnapshot = useMemo(() => citizenNation ? simulateGovernment({
    nationId: citizenNation.id, availableBudgetMinor: 100000,
    foodSecurity: (economy?.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) >= 2 ? 100 : 0,
    petitionCounts: demoGovernment.counts,
  }) : null, [citizenNation, economy, demoGovernment]);
  const government = clerkConfigured ? governmentSnapshot : demoGovernmentSnapshot;
  const pendingNation = worldNations.find((nation) => nation.id === pendingEnrollment);
  useEffect(() => {
    if (!canReadSharedWorld(clerkConfigured, citizenSessionStatus)) return;
    const controller = new AbortController();

    async function loadWorld() {
      const response = await fetch('/api/world', { signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as {
        nations: Nation[];
        workOrders: WorkOrder[];
        planningTasks: PlanningTask[];
        worldEvents: WorldEvent[];
        simulation?: SimulationState;
      };
      if (data.nations.length) setWorldNations(data.nations);
      if (data.workOrders.length) setAvailableWorkOrders(data.workOrders);
      if (data.planningTasks.length) setAvailablePlanningItems(data.planningTasks);
      if (data.worldEvents.length) setWorldEvents(data.worldEvents);
      if (data.simulation) setSimulation(data.simulation);
    }

    void loadWorld().catch(() => { /* Keep the existing public snapshot when unavailable. */ });
    return () => controller.abort();
  }, [citizenSessionStatus]);

  async function runWork(action: 'commit-work' | 'claim-work' | 'refresh-work', order?: WorkOrder, shiftId?: string) {
    if (enrollmentLock.current) return;
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || !citizenNation) return;
    if (action === 'commit-work' && citizenNation.id !== 'kindle') return;
    if (action !== 'refresh-work' && (korundIntent.current || aurelleIntent.current || marketIntent.current || playerIntent.current)) return;
    if (action === 'commit-work' && (!order || hasActiveShift || capacity < order.cost)) return;
    workLock.current = true;
    setWorkPending(true);
    setWorkError(null);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', {
          method: action === 'refresh-work' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: action === 'refresh-work' ? undefined : JSON.stringify({ action, workOrderId: order?.id, shiftId }),
        });
        const result = await response.json() as { error?: string; shifts?: WorkShift[]; capacity?: number; economy?: Economy; market?: MarketState; playerMarket?: PlayerMarketState; government?: GovernmentSnapshot | null; simulation?: SimulationState; korundPlan?: KorundPlanView | null; aurellePlan?: AurellePlanView | null; profile?: CitizenSnapshot['profile'] };
      if (epoch !== citizenEpoch.current) return;
        if (result.simulation) setSimulation(result.simulation);
        if ('korundPlan' in result) setKorundPlan(result.korundPlan ?? null);
        if ('aurellePlan' in result) setAurellePlan(result.aurellePlan ?? null);
        if (result.shifts) setWorkShifts(result.shifts);
        if (result.economy) setEconomy(result.economy);
        if (result.market) setMarket(result.market);
        if (result.playerMarket) setPlayerMarket(result.playerMarket);
        if ('government' in result) setGovernment(result.government ?? null);
        if (result.profile) setCapacity(result.profile.capacity);
        if (typeof result.capacity === 'number') setCapacity(result.capacity);
        if (!response.ok) {
          setWorkError(result.error ?? 'Your shift could not be recorded. Try again to recover its saved state.');
          return;
        }
      } else {
        // Local demo only; authenticated play is persisted by the server.
        if (action === 'refresh-work') {
          const refreshedAt = new Date().getTime();
          if (economy && refreshedAt >= Date.parse(economy.nextRecoveryAt)) {
            const periods = 1 + Math.floor((refreshedAt - Date.parse(economy.nextRecoveryAt)) / (recoverySeconds * 1000));
            setCapacity((current) => Math.min(maximumCapacity, current + periods * maximumCapacity));
            setEconomy({ ...economy, nextRecoveryAt: new Date(Date.parse(economy.nextRecoveryAt) + periods * recoverySeconds * 1000).toISOString() });
          }
        } else if (action === 'commit-work' && order) {
          const rule = shiftRules[order.id];
          if (!rule) throw new Error('Work order unavailable.');
          const startedAt = new Date().toISOString();
          setWorkShifts((current) => [{ id: crypto.randomUUID(), orderName: order.name,
            output: rule.output, capacitySpent: order.cost, startedAt,
            wageMinor: rewards[order.id]?.wageMinor, rewardItem: rewards[order.id]?.item, rewardQuantity: rewards[order.id]?.quantity,
            completesAt: new Date(Date.now() + rule.hours * 3600000).toISOString(), claimedAt: null }, ...current]);
          setCapacity((current) => current - order.cost);
        } else {
          const eligible = workShifts.find((shift) => shift.id === shiftId && !shift.claimedAt && Date.parse(shift.completesAt) <= Date.now());
          if (eligible && economy) {
            const item = eligible.rewardItem;
            const inventory = economy.inventory.filter((entry) => entry.item !== item);
            if (item) inventory.push({ item, quantity: (economy.inventory.find((entry) => entry.item === item)?.quantity ?? 0) + (eligible.rewardQuantity ?? 0) });
            setEconomy({ ...economy, walletMinor: economy.walletMinor + (eligible.wageMinor ?? 0), inventory });
          }
          setWorkShifts((current) => current.map((shift) => shift.id === shiftId
            && !shift.claimedAt && Date.parse(shift.completesAt) <= Date.now()
            ? { ...shift, claimedAt: new Date().toISOString() } : shift));
        }
      }
      setRecentAction(action === 'commit-work'
        ? `Shift started: ${order?.name}. Work continues while you are away.`
        : action === 'refresh-work' ? 'Citizen account refreshed.' : 'Shift settled: wages and goods recorded in your citizen account.');
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError('Connection interrupted. Retry to recover your saved shift.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      workLock.current = false;
      setWorkPending(false);
    }
  }

  async function runMarket(command: MarketCommand) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || korundIntent.current || aurelleIntent.current || citizenNation?.id !== 'kindle' || !economy || !market) return;
    if (playerIntent.current || !validMarketCommand(command) || (marketIntent.current && marketIntent.current.requestId !== command.requestId)) return;
    marketIntent.current = command; persistIntents();
    workLock.current = true;
    setWorkPending(true);
    setWorkError(null);
    setMarketCommand(command);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
        const result = await response.json() as { error?: string; economy?: Economy; market?: MarketState; playerMarket?: PlayerMarketState; capacity?: number };
      if (epoch !== citizenEpoch.current) return;
        if (response.status >= 500) throw new Error('Server response needs confirmation.');
        if (response.ok && (!result.economy || !result.market || typeof result.capacity !== 'number')) throw new Error('Incomplete transaction response.');
        if (result.economy) setEconomy(result.economy);
        if (result.market) setMarket(result.market);
        if (result.playerMarket) setPlayerMarket(result.playerMarket);
        if (typeof result.capacity === 'number') setCapacity(result.capacity);
        if (!response.ok) {
          setWorkError(result.error ?? 'Transaction refused. Refresh your account and check balances.');
          marketIntent.current = null; persistIntents(); setMarketCommand(null);
          return;
        }
      } else if (!demoReceipts.includes(command.requestId)) {
        const item = command.action === 'household-meal' ? 'food' : command.item!;
        const owned = economy.inventory.find((entry) => entry.item === item)?.quantity ?? 0;
        const next = { ...economy, inventory: economy.inventory.filter((entry) => entry.item !== item) };
        if (command.action === 'household-meal') {
          const now = new Date().getTime();
          if (owned < 2 || capacity >= 24 || (market.mealReadyAt && Date.parse(market.mealReadyAt) > now)) {
            setWorkError('Check food, capacity and the household meal timer.'); marketIntent.current = null; persistIntents(); setMarketCommand(null); return;
          }
          next.inventory.push({ item, quantity: owned - 2 });
          setCapacity((current) => Math.min(24, current + 4));
          setMarket({ ...market, mealReadyAt: new Date(now + recoverySeconds * 1000).toISOString() });
        } else {
          const quote = market.quotes.find((entry) => entry.item === item);
          const quantity = command.quantity!;
          if (!quote || (command.side === 'buy' ? economy.walletMinor < quote.buyMinor * quantity || quote.stock < quantity
            : owned < quantity || market.merchantCashMinor < quote.sellMinor * quantity)) {
            setWorkError('Not enough funds or goods for this trade.'); marketIntent.current = null; persistIntents(); setMarketCommand(null); return;
          }
          const cash = command.side === 'buy' ? -quote.buyMinor * quantity : quote.sellMinor * quantity;
          const goods = command.side === 'buy' ? quantity : -quantity;
          next.walletMinor += cash;
          next.inventory.push({ item, quantity: owned + goods });
          setMarket({ ...market, merchantCashMinor: market.merchantCashMinor - cash,
            quotes: market.quotes.map((entry) => entry.item === item ? { ...entry, stock: entry.stock - goods } : entry) });
        }
        setEconomy(next);
        setDemoReceipts((current) => [...current, command.requestId]);
      }
      marketIntent.current = null; persistIntents(); setMarketCommand(null);
      setRecentAction(command.action === 'household-meal'
        ? 'Household fed: 2 food consumed, up to 4 Work Capacity restored.' : `Market ${command.side}: ${command.quantity} ${command.item} settled.`);
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError(command.action === 'household-meal'
        ? 'Connection interrupted. Retry the household meal to confirm its saved result.'
        : 'Connection interrupted. Retry the previous transaction to confirm its saved result.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      workLock.current = false;
      setWorkPending(false);
    }
  }

  async function runPlayerCommand(command: PlayerCommand) {
    if (korundIntent.current || aurelleIntent.current) return;
    if (citizenNation?.id !== 'kindle') return;
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (!clerkConfigured || workLock.current || !citizenNation || !validPlayerCommand(command)
      || (playerIntent.current && playerIntent.current.requestId !== command.requestId) || marketIntent.current) return;
    playerIntent.current = command; persistIntents();
    workLock.current = true;
    setWorkPending(true); setWorkError(null); setPlayerCommand(command);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const result = await response.json() as { error?: string; economy?: Economy; playerMarket?: PlayerMarketState };
      if (epoch !== citizenEpoch.current) return;
      if (response.status >= 500 || (response.ok && (!result.economy || !result.playerMarket))) throw new Error('Response needs confirmation.');
      if (result.economy) setEconomy(result.economy);
      if (result.playerMarket) setPlayerMarket(result.playerMarket);
      playerIntent.current = null; persistIntents(); setPlayerCommand(null);
      if (!response.ok) { setWorkError(result.error ?? 'Listing action refused. Refresh your account.'); return; }
      setRecentAction(command.action === 'create-listing' ? 'Citizen listing created: goods reserved.'
        : command.action === 'buy-listing' ? 'Citizen purchase settled: payment and goods transferred.' : 'Listing cancelled: reserved goods returned.');
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError('Connection interrupted. Retry the previous listing action to confirm its saved result.');
    } finally {
      if (epoch !== citizenEpoch.current) return; workLock.current = false; setWorkPending(false); }
  }

  async function petitionGovernment(topic: PetitionTopic) {
    if (clerkConfigured && !verification?.countedActionsEligible) { setGovernmentError(verification?.reason ?? 'Checking civic eligibility.'); return; }
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || !citizenNation || !government || marketIntent.current || playerIntent.current || korundIntent.current || aurelleIntent.current) return;
    if (governmentIntent.current && governmentIntent.current.topic !== topic) {
      setGovernmentError(`Retry the previous ${governmentIntent.current.topic} petition before choosing another topic.`); return;
    }
    const intent = governmentIntent.current ?? { topic, requestId: crypto.randomUUID() };
    governmentIntent.current = intent; persistIntents();
    workLock.current = true; setGovernmentPending(true); setGovernmentError(null);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'government-petition', ...intent }) });
        const result = await response.json() as { error?:string; government?:GovernmentSnapshot|null; citizenship?:CitizenshipStatus; verification?:VerificationState };
      if (epoch !== citizenEpoch.current) return;
        if (response.status >= 500 || (response.ok && !result.citizenship)) throw new Error('Petition response needs confirmation.');
        governmentIntent.current = null; persistIntents();
        if (result.verification) setVerification(result.verification);
        if (!response.ok) { setGovernmentError(result.error ?? 'Petition refused.'); return; }
        setGovernment(result.government ?? null);
        if (result.citizenship) setCitizenshipStatus(result.citizenship);
      } else {
        const period = Math.floor(new Date().getTime()/86400000)*86400;
        if (demoGovernment.period === period) { governmentIntent.current=null; persistIntents(); setGovernmentError('One petition per citizen per UTC day.'); return; }
        setDemoGovernment({ period, counts: { ...demoGovernment.counts, [topic]: (demoGovernment.counts[topic] ?? 0)+1 } });
        setCitizenshipStatus((current) => current ? { ...current, politicalActionTaken:true, canChange:false, lockedReason:'political-action' } : current);
        governmentIntent.current=null; persistIntents();
      }
      setRecentAction('Citizen petition recorded; the rule-bound government proposal reflects public priorities.');
    } catch {
      if (epoch !== citizenEpoch.current) return; setGovernmentError('Connection interrupted. Retry the same petition topic to confirm its saved result.'); }
    finally {
      if (epoch !== citizenEpoch.current) return; workLock.current=false; setGovernmentPending(false); }
  }

  function commitWork(order: WorkOrder) { return runWork('commit-work', order); }

  async function runKorundCommand(command: KorundCommand) {
    const originalKorundClaim = command.action === 'korund-claim-work' && workShifts.some(shift => shift.id === command.shiftId && shift.currency === 'LN');
    if (marketIntent.current || playerIntent.current || aurelleIntent.current) return;
    if (!clerkConfigured || citizenSessionStatus !== 'ready' || (citizenNation?.id !== 'korund' && !originalKorundClaim) || workLock.current) return;
    if (korundIntent.current && korundIntent.current.requestId !== command.requestId) return;
    const epoch = citizenEpoch.current;
    const userId = citizenIdentity.current;
    workLock.current = true; setWorkPending(true); setWorkError(null);
    korundIntent.current = command; setKorundCommand(command);
    const persist = (value: KorundCommand | null) => {
      if (!userId) return;
      try {
        const key = `harimu-korund-intent-v1:${userId}`;
        if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
        else window.sessionStorage.removeItem(key);
      } catch { /* Preserve same-request recovery in memory. */ }
    };
    persist(command);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const result = await response.json() as { error?: string; ok?: boolean; korundPlan?: KorundPlanView; capacity?: number; shifts?: WorkShift[] };
      if (epoch !== citizenEpoch.current) return;
      if (response.status >= 500 || (response.ok && (!result.korundPlan || typeof result.capacity !== 'number'))) throw new Error('Action needs confirmation.');
      if (result.korundPlan) setKorundPlan(result.korundPlan);
      if (result.shifts) setWorkShifts(result.shifts);
      if (typeof result.capacity === 'number') setCapacity(result.capacity);
      korundIntent.current = null; setKorundCommand(null); persist(null);
      if (!response.ok) { setWorkError(result.error ?? 'Korund action refused; refresh your assignment and ration book.'); return; }
      setRecentAction(command.action === 'korund-start-work' ? 'Assigned shift started; work continues while you are away.'
        : command.action === 'korund-claim-work' ? 'Assigned-shift wages collected in Labor Notes; output added to the state food pool.'
          : command.action === 'korund-redeem-ration' ? 'Ration coupons redeemed for household food.' : 'Household ration meal recorded; capacity updated.');
    } catch {
      if (epoch === citizenEpoch.current) setWorkError('Connection interrupted. Confirm the previous Korund action to recover its saved result.');
    } finally {
      if (epoch === citizenEpoch.current) { workLock.current = false; setWorkPending(false); }
    }
  }

  const startKorundAction = (action: KorundAction, shiftId?: string) => void runKorundCommand({ action, shiftId, requestId: crypto.randomUUID() });
  async function runAurelleCommand(command: AurelleCommand) {
    const originalAurelleClaim = command.action === 'aurelle-claim-work' && workShifts.some(shift => shift.id === command.shiftId && shift.currency === 'CRN');
    if (marketIntent.current || playerIntent.current || korundIntent.current) return;
    if (!clerkConfigured || citizenSessionStatus !== 'ready' || (citizenNation?.id !== 'aurelle' && !originalAurelleClaim) || workLock.current) return;
    if (aurelleIntent.current && aurelleIntent.current.requestId !== command.requestId) return;
    const epoch = citizenEpoch.current;
    const userId = citizenIdentity.current;
    workLock.current = true; setWorkPending(true); setWorkError(null);
    aurelleIntent.current = command; setAurelleCommand(command);
    const persist = (value: AurelleCommand | null) => {
      if (!userId) return;
      try {
        const key = `harimu-aurelle-intent-v1:${userId}`;
        if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
        else window.sessionStorage.removeItem(key);
      } catch { /* Preserve same-request recovery in memory. */ }
    };
    persist(command);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const result = await response.json() as { error?: string; ok?: boolean; aurellePlan?: AurellePlanView; capacity?: number; shifts?: WorkShift[] };
      if (epoch !== citizenEpoch.current) return;
      if (response.status >= 500 || (response.ok && (!result.aurellePlan || typeof result.capacity !== 'number'))) throw new Error('Action needs confirmation.');
      if (result.aurellePlan) setAurellePlan(result.aurellePlan);
      if (result.shifts) setWorkShifts(result.shifts);
      if (typeof result.capacity === 'number') setCapacity(result.capacity);
      aurelleIntent.current = null; setAurelleCommand(null); persist(null);
      if (!response.ok) { setWorkError(result.error ?? 'Aurelle action refused; refresh your charter account.'); return; }
      setRecentAction(command.action === 'aurelle-start-work' ? 'Chartered service started; work continues while you are away.'
        : command.action === 'aurelle-claim-work' ? 'Crown wages and Favor collected; estate food recorded.'
          : command.action === 'aurelle-buy-food' ? 'Chartered food purchased.' : 'Household meal recorded; capacity updated.');
    } catch {
      if (epoch === citizenEpoch.current) setWorkError('Connection interrupted. Confirm the previous Aurelle action to recover its saved result.');
    } finally {
      if (epoch === citizenEpoch.current) { workLock.current = false; setWorkPending(false); }
    }
  }

  const startAurelleAction = (action: AurelleAction, shiftId?: string, quantity?: 1 | 2) => void runAurelleCommand({ action, shiftId, quantity, requestId: crypto.randomUUID() });
  function changeView(nextView: ViewMode) {
    if (nextView !== 'world') stopTour();
    const nextNation = nextView === 'country' && !['world','country','nation'].includes(viewMode) && citizenNation ? citizenNation.id : selected.id;
    setSelectedId(nextNation);
    const visitingCity = new URLSearchParams(window.location.search).get('city');
    const cityId = citizenNation ? currentCityAccount?.currentCityId : visitingCity && cityForNation(nextNation,visitingCity) ? visitingCity : undefined;
    const href = sceneUrl(window.location.href, nextView, nextNation, cityId ?? undefined);
    if (href !== window.location.href) window.history.pushState(sceneHistoryState(window.history.state, window.location.pathname), '', href);
    window.dispatchEvent(new Event('harimu-scenechange'));
  }

  function selectNation(nationId: string) {
    if (!worldNations.some(nation => nation.id === nationId)) return;
    stopTour();
    setSelectedId(nationId);
    setNationFocusRevision(value => value + 1);
    if (!['nation','world','country'].includes(viewMode)) return;
    const href = sceneUrl(window.location.href, viewMode, nationId);
    if (href !== window.location.href) window.history.pushState(sceneHistoryState(window.history.state, window.location.pathname), '', href);
    window.dispatchEvent(new Event('harimu-scenechange'));
  }

  async function travelCity(cityId:string) {
    if (cityTravelLock.current || !cityForNation(selected.id,cityId)) return;
    if (!clerkConfigured || (!citizenNation && citizenSessionStatus === 'anonymous')) {
      const href=sceneUrl(window.location.href,'square',selected.id,cityId);
      window.history.pushState(sceneHistoryState(window.history.state,window.location.pathname),'',href);
      window.dispatchEvent(new Event('harimu-scenechange')); return;
    }
    if (citizenSessionStatus !== 'ready' || citizenNation?.id !== selected.id || !currentCityAccount) return;
    const epoch=citizenEpoch.current;
    cityTravelLock.current=true;setCityTravelPending(true);setCityError('');
    try {
      const response=await fetch('/api/city',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'travel',cityId})});
      const value=await response.json() as CityLocation & {presence:{cityId:string;present:number}[];error?:string};
      if(epoch!==citizenEpoch.current)return;
      if(!response.ok || value.nationId!==citizenNation.id || value.currentCityId!==cityId)throw Error(value.error ?? 'Travel could not be confirmed. Refresh your city account before retrying.');
      setCityAccount({key:citizenSessionKey,value});
      const href=sceneUrl(window.location.href,'square',citizenNation.id,value.currentCityId);
      window.history.pushState(sceneHistoryState(window.history.state,window.location.pathname),'',href);
      window.dispatchEvent(new Event('harimu-scenechange'));
    } catch(error){if(epoch===citizenEpoch.current)setCityError(error instanceof Error?error.message:'Travel could not be confirmed.');}
    finally{if(epoch===citizenEpoch.current){cityTravelLock.current=false;setCityTravelPending(false);}}
  }

  function togglePlan(id: string) {
    setCompletedPlanIds((current) => (current.includes(id) ? [] : [id]));
    setPlanSaved(false);
    setDecisionError(null);
  }

  async function saveHouseholdPlan() {
    if (decisionPending || (clerkConfigured && citizenSessionStatus !== 'ready')) return;
    if (!clerkConfigured) { setPlanSaved(true); return; }
    const epoch = citizenEpoch.current;
    setDecisionPending(true); setDecisionError(null);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-plan', horizon, note: planNote, completedIds: completedPlanIds }) });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (epoch !== citizenEpoch.current) return;
      if (!response.ok || !result.ok) { setDecisionError(result.error ?? 'Household draft could not be saved.'); return; }
      setPlanSaved(true);
    } catch { if (epoch === citizenEpoch.current) setDecisionError('Connection interrupted. Your draft is still here; try saving again.'); }
    finally { if (epoch === citizenEpoch.current) setDecisionPending(false); }
  }

  const hydrateCitizen = useCallback((snapshot: CitizenSnapshot) => {
    setKorundPlan(snapshot.korundPlan ?? null);
    setAurellePlan(snapshot.aurellePlan ?? null);
    if (snapshot.simulation) setSimulation(snapshot.simulation);
    setVerification(snapshot.verification ?? null);
    setWorkShifts(snapshot.shifts ?? []);
    if (snapshot.market) setMarket(snapshot.market);
    if (snapshot.playerMarket) setPlayerMarket(snapshot.playerMarket);
    if ('government' in snapshot) setGovernment(snapshot.government ?? null);
    if (snapshot.demoGovernment) setDemoGovernment(snapshot.demoGovernment);
    setDemoReceipts(snapshot.demoReceipts ?? []);
    setDemoStarterGranted(snapshot.demoStarterGranted ?? false);
    if (snapshot.economy) setEconomy(snapshot.economy);
    else if (!clerkConfigured) setEconomy({ walletMinor: 0, inventory: [], nextRecoveryAt: new Date(new Date().getTime() + recoverySeconds * 1000).toISOString() });
    if (!clerkConfigured && snapshot.profile?.nationId === 'kindle' && !snapshot.market) {
      setMarket({ available: true, merchantCashMinor: 100000, mealReadyAt: null, mealFood: 2, mealCapacity: 4, mealIntervalSeconds: recoverySeconds,
        quotes: marketSeeds.map(([item, label, buyMinor, sellMinor, stock]) => ({ item, label, buyMinor, sellMinor, stock })) });
      if (!snapshot.demoStarterGranted) {
        setDemoStarterGranted(true);
        setEconomy((current) => current ? { ...current, inventory: [{ item: 'food', quantity: (current.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) + 2 }, ...current.inventory.filter((entry) => entry.item !== 'food')] } : current);
      }
    }
    if (snapshot.profile) {
      setCitizenNationId(snapshot.profile.nationId);
      setCitizenshipStatus(snapshot.profile.citizenship);
      setCapacity(snapshot.profile.capacity);
      setInfluence(snapshot.profile.influence);
      setWaterSecurity(snapshot.profile.waterSecurity);
      setWardStability(snapshot.profile.wardStability);
    }
    if (snapshot.plan) {
      setHorizon(snapshot.plan.horizon);
      setCompletedPlanIds(snapshot.plan.completedIds);
      setPlanNote(snapshot.plan.note);
      setPlanSaved(true);
    }
    if (snapshot.decision) {
      setCommittedDecision(snapshot.decision);
      setCompletedPlanIds([snapshot.decision.optionId]);
      setRecentAction(`World record · ${snapshot.decision.outcome}`);
    }
  }, []);

  useEffect(() => {
    if (clerkConfigured) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem('harimu-citizen-demo-v1');
        if (saved) hydrateCitizen(JSON.parse(saved) as CitizenSnapshot);
      } catch {
        setWorkError('Local demo storage could not be restored.');
      }
      setDemoLoaded(true);
    });
    return () => { cancelled = true; };
  }, [hydrateCitizen]);

  useEffect(() => {
    if (clerkConfigured || !demoLoaded) return;
    try {
      window.localStorage.setItem('harimu-citizen-demo-v1', JSON.stringify({
        shifts: workShifts, economy, market, demoReceipts, demoStarterGranted, demoGovernment,
        profile: citizenshipStatus ? { nationId: citizenNationId, capacity, influence,
          waterSecurity, wardStability, citizenship: citizenshipStatus } : null,
        plan: { horizon, note: planNote, completedIds: completedPlanIds },
        decision: committedDecision,
      }));
    } catch {
      queueMicrotask(() => setWorkError('Local demo storage is unavailable; this session will not survive a refresh.'));
    }
  }, [demoLoaded, workShifts, economy, market, demoReceipts, demoStarterGranted, demoGovernment, citizenshipStatus, citizenNationId, capacity, influence,
    waterSecurity, wardStability, horizon, planNote, completedPlanIds, committedDecision]);

  async function commitDecision(input: DecisionCommitInput) {
    if (decisionPending) return;
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    const selectedOption = availablePlanningItems.find((item) => item.id === input.optionId);
    if (!selectedOption || committedDecision) return;
    if (capacity + selectedOption.effects.capacity < 0) { setDecisionError('Not enough Work Capacity for this commitment.'); return; }
    setDecisionPending(true);
    setDecisionError(null);

    if (!clerkConfigured) {
      const localDecision: CitizenDecision = {
        decisionId: 'eastern-waterworks-day-42',
        optionId: selectedOption.id,
        infrastructureId: input.infrastructureId,
        householdMemberId: input.householdMemberId,
        effects: selectedOption.effects,
        outcome: selectedOption.outcome,
        committedAt: new Date().toISOString(),
      };
      setCapacity((current) => current + selectedOption.effects.capacity);
      setInfluence((current) => current + selectedOption.effects.influence);
      setWaterSecurity((current) => Math.min(100, current + selectedOption.effects.water));
      setWardStability((current) => Math.min(100, current + selectedOption.effects.stability));
      setCommittedDecision(localDecision);
      setCitizenshipStatus((current) => current ? {
        ...current,
        canChange: false,
        politicalActionTaken: true,
        lockedReason: 'political-action',
      } : current);
      setPlanSaved(true);
      setRecentAction(`World record · ${localDecision.outcome}`);
      setDecisionPending(false);
      return;
    }

    try {
      const response = await fetch('/api/citizen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit-decision',
          optionId: input.optionId,
          infrastructureId: input.infrastructureId,
          householdMemberId: input.householdMemberId,
          horizon,
          note: planNote,
        }),
      });
      const result = await response.json() as {
        error?: string;
        profile?: CitizenSnapshot['profile'];
        decision?: CitizenDecision;
      };
      if (epoch !== citizenEpoch.current) return;
      if (!response.ok || !result.profile || !result.decision) {
        setDecisionError(result.error ?? 'The world record could not save this decision yet.');
        return;
      }

      setCapacity(result.profile.capacity);
      setInfluence(result.profile.influence);
      setWaterSecurity(result.profile.waterSecurity);
      setWardStability(result.profile.wardStability);
      setCommittedDecision(result.decision);
      setCitizenshipStatus(result.profile.citizenship);
      setCompletedPlanIds([result.decision.optionId]);
      setPlanSaved(true);
      setRecentAction(`World record · ${result.decision.outcome}`);
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setDecisionError('The world record could not save this decision yet.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      setDecisionPending(false);
    }
  }

  async function confirmEnrollment(nation: Nation) {
    if (enrollmentLock.current) return;
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    if (workLock.current || marketIntent.current || playerIntent.current || korundIntent.current || aurelleIntent.current) { setEnrollmentError('Confirm your pending economic action before changing citizenship.'); return; }
    const epoch = citizenEpoch.current;
    enrollmentLock.current = true;
    setEnrollmentPending(true);
    setEnrollmentError(null);

    if (!clerkConfigured) {
      const changing = Boolean(citizenNation && citizenNation.id !== nation.id);
      if ((citizenNation?.id ?? null) !== enrollmentExpectedNation || (changing && (!citizenshipStatus?.canChange
        || !citizenshipStatus.graceEndsAt || Date.now() >= Date.parse(citizenshipStatus.graceEndsAt)))) {
        setEnrollmentError('Citizenship has changed or the grace period is closed. Keep exploring and review your current citizen.');
        setEnrollmentPending(false); enrollmentLock.current = false;
        return;
      }
      if (citizenNation?.id === nation.id) {
        closeEnrollmentReview(); setEnrollmentPending(false); enrollmentLock.current = false; return;
      }
      if (!economy) setEconomy({ walletMinor: 0, inventory: [], nextRecoveryAt: new Date(Date.now() + recoverySeconds * 1000).toISOString() });
      setMarket((current) => current ? { ...current, available: nation.id === 'kindle' } : {
        available: nation.id === 'kindle', merchantCashMinor: 100000, mealReadyAt: null, mealFood: 2, mealCapacity: 4, mealIntervalSeconds: recoverySeconds,
        quotes: marketSeeds.map(([item, label, buyMinor, sellMinor, stock]) => ({ item, label, buyMinor, sellMinor, stock })),
      });
      if (nation.id === 'kindle' && !demoStarterGranted) {
        setDemoStarterGranted(true);
        setEconomy((current) => ({ walletMinor: current?.walletMinor ?? 0,
          nextRecoveryAt: current?.nextRecoveryAt ?? new Date(new Date().getTime() + recoverySeconds * 1000).toISOString(),
          inventory: [{ item: 'food', quantity: (current?.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) + 2 },
            ...(current?.inventory.filter((entry) => entry.item !== 'food') ?? [])] }));
      }
      const changingNation = Boolean(citizenNation && citizenNation.id !== nation.id);
      const now = Date.now();
      setCitizenNationId(nation.id);
      setSelectedId(nation.id);
      setCitizenshipStatus(changingNation ? {
        enrolledAt: citizenshipStatus?.enrolledAt ?? new Date(now).toISOString(),
        graceEndsAt: citizenshipStatus?.graceEndsAt ?? new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        changesRemaining: 0,
        politicalActionTaken: false,
        canChange: false,
        lockedReason: 'change-used',
      } : {
        enrolledAt: new Date(now).toISOString(),
        graceEndsAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        changesRemaining: 1,
        politicalActionTaken: false,
        canChange: true,
        lockedReason: null,
      });
      closeEnrollmentReview();
      setEnrollmentPending(false); enrollmentLock.current = false;
      changeView('workplace');
      return;
    }

    try {
      const response = await fetch('/api/citizen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', nationId: nation.id, expectedNationId: enrollmentExpectedNation }),
      });
      const result = await response.json() as {
        error?: string;
        nationId?: string;
        capacity?: number | null;
        government?: GovernmentSnapshot | null;
        verification?: VerificationState;
        simulation?: SimulationState;
        citizenship?: CitizenshipStatus | null;
        economy?: Economy;
        market?: MarketState;
        playerMarket?: PlayerMarketState;
        aurellePlan?: AurellePlanView | null;
  korundPlan?: KorundPlanView | null;
      };
      if (epoch !== citizenEpoch.current) return;
      if (!response.ok || !result.nationId) {
        if (result.citizenship) setCitizenshipStatus(result.citizenship);
        setEnrollmentError(result.error ?? 'Citizenship could not be recorded yet.');
        return;
      }

      if (typeof result.capacity !== 'number' || !Number.isFinite(result.capacity)) {
        setEnrollmentError('Citizenship recorded, but Work Capacity could not be loaded. Refresh your citizen account before starting work.');
        return;
      }
      setCapacity(result.capacity);
      if ('government' in result) setGovernment(result.government ?? null);
      if (result.verification) setVerification(result.verification);
      if (result.simulation) setSimulation(result.simulation);
      setCitizenNationId(result.nationId);
      setSelectedId(result.nationId);
      setKorundPlan(result.korundPlan ?? null);
      setAurellePlan(result.aurellePlan ?? null);
      if (result.citizenship) setCitizenshipStatus(result.citizenship);
      if (result.economy) setEconomy(result.economy);
      if (result.market) setMarket(result.market);
      if (result.playerMarket) setPlayerMarket(result.playerMarket);
      closeEnrollmentReview();
      changeView('workplace');
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setEnrollmentError('Citizenship could not be recorded yet. Please try again.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      setEnrollmentPending(false); enrollmentLock.current = false;
    }
  }

  function beginEnrollment(nationId: string) {
    if (enrollmentLock.current) return;
    if (!worldNations.some(nation => nation.id === nationId)) return;
    setFirstVisitGuideOpen(false);
    stopTour();
    writeEnrollmentReview(citizenIdentity.current, { nationId, expectedNationId: citizenNation?.id ?? null });
    setEnrollmentExpectedNation(citizenNation?.id ?? null);
    setEnrollmentError(null);
    setPendingEnrollment(nationId);
  }

  const priorNationShift = workShifts.find(shift => !shift.claimedAt && ((shift.currency ?? 'SPK') !== (citizenNation?.id === 'korund' ? 'LN' : citizenNation?.id === 'aurelle' ? 'CRN' : 'SPK')));
  const priorShiftPanel = priorNationShift && <PriorNationShift shift={priorNationShift}
    currency={priorNationShift.currency ?? 'SPK'} pending={workPending} uncertain={Boolean(korundCommand || aurelleCommand || marketCommand || playerCommand)}
    onRetry={() => { if (korundIntent.current) void runKorundCommand(korundIntent.current);
      else if (aurelleIntent.current) void runAurelleCommand(aurelleIntent.current); else if (marketIntent.current) void runMarket(marketIntent.current); else if (playerIntent.current) void runPlayerCommand(playerIntent.current); }}
    onClaim={() => { if (priorNationShift.currency === 'LN') startKorundAction('korund-claim-work', priorNationShift.id);
      else if (priorNationShift.currency === 'CRN') startAurelleAction('aurelle-claim-work', priorNationShift.id);
      else void runWork('claim-work', undefined, priorNationShift.id); }} />;
  const korundPanel = <KorundPlanPanel plan={korundPlan} scene={viewMode} capacity={capacity} pending={workPending} otherShiftActive={Boolean(priorNationShift)}
    uncertain={Boolean(korundCommand)} localDemo={!clerkConfigured} error={workError} onNavigate={changeView}
    onCommand={startKorundAction} onRetry={() => { if (korundIntent.current) void runKorundCommand(korundIntent.current); }}
    onRefresh={() => void runWork('refresh-work')} />;
  const aurellePanel = <AurellePlanPanel plan={aurellePlan} scene={viewMode} capacity={capacity} pending={workPending} otherShiftActive={Boolean(priorNationShift)}
    uncertain={Boolean(aurelleCommand || korundCommand || marketCommand || playerCommand)} localDemo={!clerkConfigured} error={workError} onNavigate={changeView}
    onCommand={startAurelleAction} onRetry={() => { if (aurelleIntent.current) void runAurelleCommand(aurelleIntent.current); }} onRefresh={() => void runWork('refresh-work')} />;
  const dailyLoop = citizenNation?.id === 'aurelle' ? <>{priorShiftPanel}{aurellePanel}</> : citizenNation?.id === 'korund' ? <>{priorShiftPanel}{korundPanel}</> : priorNationShift ? priorShiftPanel : citizenNation && <DailyLoop nationName={citizenNation.shortName} supported={citizenNation.id === 'kindle'}
    localDemo={!clerkConfigured} view={viewMode} economy={economy} market={market} shifts={workShifts} capacity={capacity}
    jobs={availableWorkOrders.filter(order => !order.nationId || order.nationId === citizenNation.id)}
    busy={workPending || Boolean(playerCommand) || Boolean(korundCommand)} uncertain={Boolean(marketCommand)} onNavigate={changeView}
    onStart={id => { const order = availableWorkOrders.find(item => item.id === id); if (order) void commitWork(order); }}
    onClaim={id => void runWork('claim-work', undefined, id)} onRefresh={() => void runWork('refresh-work')}
    onBuyFood={quantity => void runMarket({ requestId: crypto.randomUUID(), action: 'market-trade', side: 'buy', item: 'food', quantity })}
    onMeal={() => void runMarket({ requestId: crypto.randomUUID(), action: 'household-meal' })} />;

  useEffect(() => {const tick=()=>setGuideNow(Date.now());tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer);},[citizenNationId]);
  const goods = (item:string)=>economy?.inventory.find(entry=>entry.item===item)?.quantity ?? 0;
  const firstLoop = citizenNation && firstLoopStep({nationId:citizenNation.id,enrolledAt:citizenshipStatus?.enrolledAt,now:guideNow,
    shifts:workShifts,food:citizenNation.id==='aurelle' ? aurellePlan?.foodQuantity ?? 0 : citizenNation.id==='korund' ? korundPlan?.foodQuantity ?? 0 : goods('food'),
    mealReadyAt:citizenNation.id==='aurelle' ? aurellePlan?.mealReadyAt : citizenNation.id==='korund' ? korundPlan?.mealReadyAt : market?.mealReadyAt});
  const firstLoopHint = firstLoop && <p className="game-first-loop" role="status">Getting started · {firstLoop.step}/3 · {firstLoop.label}</p>;
  const guestAllowed = !clerkConfigured || citizenSessionStatus === 'anonymous';
  const guestActive = guestAllowed && guestMode;
  useEffect(() => {
    if (!tourOpen || guestAllowed) return;
    const frame = requestAnimationFrame(stopTour);
    return () => cancelAnimationFrame(frame);
  }, [tourOpen, guestAllowed, stopTour]);
  function startGuestDemo() {
    if (!guestAllowed) return;
    setFirstVisitGuideOpen(false);
    stopTour();
    setGuestState(createGuestDemo()); setGuestMode(true); closeEnrollmentReview(); changeView('workplace');
  }
  function leaveGuestDemo() { setGuestMode(false); setGuestState(createGuestDemo()); changeView('world'); }
  function navigateGame(view: SceneView) {
    stopTour();
    if (guestActive && !['household','workplace','market'].includes(view)) {
      setGuestMode(false); setGuestState(createGuestDemo());
    }
    changeView(view);
  }
  function actInGuestDemo(action: GuestDemoAction) { setGuestState(current => guestDemoAction(current, action)); }
  const guestEntry = guestAllowed && <button type="button" className="primary-action" onClick={startGuestDemo}>Try a day in the life</button>;
  const citizenScene = <section className={`citizen-scene scene-${viewMode}`} aria-label="Citizen location actions">
    {!citizenNation ? <div className="scene-access">{guestEntry}<p>{clerkConfigured && citizenSessionStatus === 'loading' ? 'Loading your citizen…' : 'Explore a nation, then choose citizenship to begin.'}</p>
      {citizenSessionStatus==='error' ? <button type="button" onClick={()=>setSessionRetry(value=>value+1)}>Retry loading citizen</button> : <button type="button" onClick={() => changeView('world')}>Explore nations</button>}
      {clerkConfigured && citizenSessionStatus === 'anonymous' && <SignInButton mode="modal"><button type="button">Sign in</button></SignInButton>}
    </div> : <>
      {citizenNation.id !== 'aurelle' && aurelleCommand && <div role="alert"><p>A previous Aurelle action needs confirmation.</p><button type="button" disabled={workPending} onClick={() => { if (aurelleIntent.current) void runAurelleCommand(aurelleIntent.current); }}>Confirm previous Aurelle action</button></div>}
      {citizenNation.id !== 'korund' && korundCommand && <div role="alert"><p>A previous Korund action needs confirmation. Its original currency and ledger are preserved.</p><button type="button" disabled={workPending} onClick={() => { if (korundIntent.current) void runKorundCommand(korundIntent.current); }}>Confirm previous Korund action</button></div>}
      {viewMode !== 'government' && <>{firstLoopHint}{dailyLoop}</>}
      {viewMode === 'household' && <>
        {!['korund','aurelle'].includes(citizenNation.id) && <>
        <section className="scene-belongings"><h2>Belongings and recovery</h2><p>{capacity} / 24 WC · {((economy?.walletMinor ?? 0) / 100).toFixed(2)} SPK</p>
          <ul>{economy?.inventory.map((entry) => <li key={entry.item}>{entry.item}: {entry.quantity} available</li>)}</ul>
          <p>Listed goods remain reserved at the market. Capacity recovers while you are away.</p>
          {economy?.nextRecoveryAt && <p>Next recovery: {new Date(economy.nextRecoveryAt).toLocaleString()}</p>}
        </section>
        <CitizenMarket showTrading={false} market={market} economy={economy} capacity={capacity} busy={workPending || Boolean(playerCommand) || Boolean(korundCommand)} uncertain={Boolean(marketCommand) && !workPending} pendingAction={marketCommand?.action}
          onTrade={(side, item, quantity) => void runMarket({ requestId: crypto.randomUUID(), action: 'market-trade', side, item, quantity })}
          onMeal={() => void runMarket({ requestId: crypto.randomUUID(), action: 'household-meal' })} onRetry={() => { if (marketCommand) void runMarket(marketCommand); }} />
        {!market?.available && <p>Household meals are currently supported for Kindle citizens. Other national economies are planned.</p>}
        </>}
        <details className="household-planning"><summary>Household notes and commitments</summary>
          <p>Keep a private draft for household choices. Recording a personal prototype commitment applies its effects and ends the citizenship grace period. These choices do not count as votes, petition signatures or policy input.</p>
          <label htmlFor="household-horizon">Planning horizon</label>
          <select id="household-horizon" disabled={decisionPending} value={horizon} onChange={event => { setHorizon(event.target.value as PlanHorizon); setPlanSaved(false); }}>
            <option value="today">Today</option><option value="week">This week</option><option value="season">This season</option>
          </select>
          <label htmlFor="household-note">Private household note</label>
          <textarea id="household-note" disabled={decisionPending} rows={3} maxLength={2000} value={planNote} onChange={event => { setPlanNote(event.target.value); setPlanSaved(false); }} />
          <button type="button" disabled={decisionPending} onClick={() => void saveHouseholdPlan()}>{decisionPending ? 'Saving…' : planSaved ? 'Draft saved' : 'Save household draft'}</button>
          {committedDecision ? <p>Recorded commitment: {committedDecision.outcome} · {new Date(committedDecision.committedAt).toLocaleDateString()}</p> : <>
            <p>Prototype civic choices · distinct from paid workplace shifts; these legacy choices are currently available only in Kindle.</p>
            {citizenNation.id === 'kindle' && availablePlanningItems.map(task => <button key={task.id} type="button" disabled={decisionPending} aria-pressed={completedPlanIds.includes(task.id)} onClick={() => togglePlan(task.id)}>
              <strong>{task.title}</strong><span>{task.detail} · Capacity {task.effects.capacity >= 0 ? '+' : ''}{task.effects.capacity} · Influence +{task.effects.influence}</span>
            </button>)}
            <button type="button" disabled={decisionPending || !completedPlanIds.length || citizenNation.id !== 'kindle'} onClick={() => {
              const task = availablePlanningItems.find(item => completedPlanIds.includes(item.id));
              if (task) void commitDecision({ optionId: task.id, infrastructureId: task.infrastructureId, householdMemberId: task.householdMemberId });
            }}>Record personal commitment</button>
          </>}
          {decisionError && <p role="alert">{decisionError}</p>}
        </details>
      </>}
      {viewMode === 'workplace' && !['korund','aurelle'].includes(citizenNation.id) && <>
        <WorkShiftBoard shifts={workShifts.filter(shift => !shift.currency || shift.currency === 'SPK')} pending={workPending} error={workError} localDemo={!clerkConfigured} economy={economy}
          onRefresh={() => void runWork('refresh-work')} onClaim={(id) => void runWork('claim-work', undefined, id)} />
        <section className="scene-work-orders"><h2>Available contributions</h2>
          {availableWorkOrders.filter((order) => !order.nationId || order.nationId === citizenNation.id).map((order) => <button key={order.id} type="button"
            disabled={workPending || Boolean(korundCommand) || hasActiveShift || capacity < order.cost} onClick={() => void commitWork(order)}>
            <strong>{order.name}</strong><span>{order.detail} · {order.cost} WC{rewards[order.id] ? ` · ${(rewards[order.id].wageMinor / 100).toFixed(2)} SPK + ${rewards[order.id].quantity} ${rewards[order.id].item}` : ''}</span></button>)}
        {availableWorkOrders.filter((order) => !order.nationId || order.nationId === citizenNation.id).length === 0 && <p>No shifts are available for this nation yet. Kindle has the first supported work and wage programme; other national workplaces are planned.</p>}
        </section><button type="button" onClick={() => changeView('market')}>Take your earnings to market</button>
      </>}
      {viewMode === 'market' && !['korund','aurelle'].includes(citizenNation.id) && <>
        <CitizenMarket showMeal={false} market={market} economy={economy} capacity={capacity} busy={workPending || Boolean(playerCommand) || Boolean(korundCommand)} uncertain={Boolean(marketCommand) && !workPending} pendingAction={marketCommand?.action}
          onTrade={(side, item, quantity) => void runMarket({ requestId: crypto.randomUUID(), action: 'market-trade', side, item, quantity })}
          onMeal={() => void runMarket({ requestId: crypto.randomUUID(), action: 'household-meal' })} onRetry={() => { if (marketCommand) void runMarket(marketCommand); }} />
        <PlayerMarket state={playerMarket} economy={economy} demo={!clerkConfigured} busy={workPending || Boolean(marketCommand) || Boolean(korundCommand)} uncertain={Boolean(playerCommand)}
          onCommand={(command) => void runPlayerCommand({ ...command, requestId: crypto.randomUUID() })} onRetry={() => { if (playerCommand) void runPlayerCommand(playerCommand); }} />
        {!market?.available && <p>Trading is currently supported in Kindle. Other nation markets are planned.</p>}
        <button type="button" onClick={() => changeView('household')}>Return to household</button>
      </>}
      {viewMode === 'government' && <>
        <h2>{citizenNation.government}</h2><p>{citizenNation.name} follows its own institutions. Computer-controlled leaders hold every government office in this release. AI/SI means artificial or simulated intelligence; today, fixed game rules choose their actions, with no live AI model connected.</p>
        <GovernmentPanel nationId={citizenNation.id} onRetry={() => setSessionRetry(value => value + 1)} simulation={simulation ?? undefined} verification={verification} snapshot={government} localDemo={!clerkConfigured} pending={governmentPending} error={governmentError} onPetition={(topic) => void petitionGovernment(topic)} />
        <p>Elections, protests and public opinion systems are planned and will follow each nation’s rules. No election or protest is currently open here.</p>
      </>}
    </>}
  </section>;

  const worldPanel = <section className="game-national-context" aria-label="Nation exploration and citizenship">
    {guestAllowed && (firstVisitGuideOpen
      ? tourOpen ? <GlobeTour onFocus={setTourFocusNation} onClose={finishTour} /> : <FirstVisitGuide stage={firstVisitStage} onStageChange={setFirstVisitStage} onShortlist={setShortlistIds} onStartTour={() => setTourOpen(true)} onTryGuest={startGuestDemo} onDismiss={() => { stopTour(); setFirstVisitGuideOpen(false); }} />
      : <button type="button" className="secondary-action" onClick={() => { setFirstVisitStage('arrival'); setShortlistIds([]); setFirstVisitGuideOpen(true); }}>Restart first-visit guide</button>)}
    <p className="eyebrow">Exploring · {selected.shortName}</p>
    {guestEntry}
    <NationComparison nations={worldNations} />
    <dl><dt>Capital</dt><dd>{selected.capital}</dd><dt>Government</dt><dd>{selected.government}</dd><dt>Economy</dt><dd>{selected.economy}</dd><dt>Currency</dt><dd>{selected.currency}</dd><dt>Religion</dt><dd>{selected.religion}</dd></dl>
    {citizenSessionStatus==='error' && <p role="alert">Citizen record unavailable. <button type="button" onClick={()=>setSessionRetry(value=>value+1)}>Retry loading citizen</button></p>}
    <p>{selected.id === 'kindle' ? 'Work · Trade · Household meals' : selected.id === 'korund' ? 'Assigned work · Rations · Household meals' : selected.id === 'aurelle' ? 'Chartered service · Crowns · Favor' : 'Unfinished nation · Chat available; work, markets and government previews are not built yet'}</p>
    <details><summary>Rules and limits</summary><p>Each nation keeps its own rules. Computer-controlled leaders (AI/SI) follow fixed game rules: the same situation produces the same decision. No live AI model is connected. Petitions require a verified phone number to count, but phone verification has not been set up yet, so petition submission is unavailable. Territory ownership and foreign trade are not built yet.</p></details>
    {citizenNation ? <><p>Your citizen: {citizenNation.name}. {citizenshipRuleLabel(citizenshipStatus)}</p>
      {citizenNation.id!==selected.id && citizenshipStatus?.canChange && <button type="button" onClick={()=>beginEnrollment(selected.id)}>Change citizenship to {selected.shortName}</button>}</> : <button type="button" disabled={clerkConfigured && ['loading','error'].includes(citizenSessionStatus)} onClick={()=>beginEnrollment(selected.id)}>Choose citizenship · {selected.shortName}</button>}
    <button type="button" onClick={()=>changeView('nation')}>Inspect national institutions</button>
  </section>;
  const countryNation = selected;
  const requestedPreviewCity = new URLSearchParams(locationSearch).get('city');
  const previewCity = requestedPreviewCity ? cityForNation(selected.id,requestedPreviewCity) : undefined;
  const activeCity = clerkConfigured && citizenNation ? currentCityAccount ? cityForNation(citizenNation.id,currentCityAccount.currentCityId) : capitalCityForNation(citizenNation.id) : previewCity ?? capitalCityForNation(selected.id);
  const countryOwnNation = clerkConfigured && citizenNation?.id === countryNation.id;
  const countryCityId = countryOwnNation ? currentCityAccount?.currentCityId ?? capitalCityForNation(countryNation.id)?.id ?? null : previewCity?.id ?? capitalCityForNation(countryNation.id)?.id ?? null;
  const countryHomeId = countryOwnNation ? currentCityAccount?.homeCityId ?? capitalCityForNation(countryNation.id)?.id ?? null : capitalCityForNation(countryNation.id)?.id ?? null;
  const canCityTravel = !clerkConfigured || citizenSessionStatus === 'anonymous' || Boolean(countryOwnNation && currentCityAccount && citizenSessionStatus === 'ready');
  const countryMap = <CountryScene key={`${citizenSessionKey}:${countryNation.id}`} nationId={countryNation.id} currentCityId={countryCityId} homeCityId={countryHomeId} onTravel={cityId=>void travelCity(cityId)} pending={cityTravelPending} travelEnabled={canCityTravel} preview={!clerkConfigured || !citizenNation} presence={countryOwnNation ? currentCityAccount?.presence : undefined} />;
  const countryPanel = <section aria-label="Country travel"><p>{countryNation.name} · three cities from the official lore.</p><p>Free, instant travel. Home stays in the capital. Jobs and markets are shared across these cities in this preview.</p>{cityError && <p role="alert">{cityError}</p>}{citizenNation && !currentCityAccount && <button type="button" onClick={()=>setCityRetry(value=>value+1)}>Refresh city account</button>}<button type="button" onClick={()=>changeView('square')}>Open City</button></section>;
  const gamePanel = viewMode==='world' ? worldPanel : viewMode==='country' ? countryPanel : viewMode==='square' ? <>
    {guestAllowed && <button type="button" onClick={() => { stopTour(); setFirstVisitStage('arrival'); setShortlistIds([]); setFirstVisitGuideOpen(true); changeView('world'); }}>Start first-visit guide</button>}
    {firstLoopHint}{dailyLoop}
    <p>{activeCity?.name ?? citizenNation?.capital ?? 'The city'} · A citizen’s daily life runs through home, work, market and civic institutions.</p>
    <SquareChat key={`${citizenSessionKey}:${citizenNationId}:${activeCity?.id}`} cityId={citizenNation ? currentCityAccount?.currentCityId : undefined} configured={clerkConfigured} session={citizenSessionStatus==='ready' && citizenNationId && !currentCityAccount ? 'loading' : citizenSessionStatus} enabled={clerkConfigured && citizenSessionStatus==='ready' && Boolean(citizenNationId) && Boolean(currentCityAccount)} nationId={citizenNationId} />
    <SceneNews events={worldEvents} title="City noticeboard" />
  </> : ['household','workplace','market','government'].includes(viewMode) ? citizenScene : viewMode==='nation' ?
    <NationInstitutions nation={selected} nations={worldNations} citizenNation={citizenNation} capacity={capacity}
      workPending={workPending || hasActiveShift || Boolean(korundCommand || aurelleCommand || marketCommand || playerCommand)}
      onSelectNation={selectNation} onWorldView={() => changeView('world')} onHousehold={() => changeView('household')}
      onWorkplace={() => changeView('workplace')} onCommitWork={commitWork}
      workOrders={availableWorkOrders.filter(order => order.nationId !== 'korund')} /> : citizenScene;
  const activeShift = priorNationShift ?? (citizenNation?.id === 'aurelle' ? aurellePlan?.shifts ?? [] : citizenNation?.id === 'korund' ? korundPlan?.shifts ?? [] : workShifts).find(shift=>!shift.claimedAt);
  const contextItems: { id: string; label: string; detail: string; selected?: boolean; onSelect?: () => void }[] =
    viewMode === 'country' ? [{id:'current-city',label:'Open City',detail:countryOwnNation ? activeCity?.name ?? 'Loading your city' : cityForNation(selected.id,countryCityId ?? '')?.name ?? 'City preview',onSelect:()=>changeView('square')}] : citizenNation?.id === 'aurelle' && ['household','workplace','market'].includes(viewMode) ? [
      {id:'aurelle-service',label:'Chartered service',detail:'4 WC · 8 CRN · 2 Favor',onSelect:()=>changeView('workplace')},
      {id:'aurelle-food',label:'Chartered food',detail:`${aurellePlan?.publicFoodRemaining ?? 0} at estate · 1.50 CRN each`,onSelect:()=>changeView('market')},
      {id:'aurelle-household',label:'Household',detail:`${aurellePlan?.foodQuantity ?? 0} food · ${aurellePlan?.favor ?? 0} Favor`,onSelect:()=>changeView('household')},
    ] : citizenNation?.id === 'korund' && ['household', 'workplace', 'market'].includes(viewMode) ? [
      { id: 'korund-assignment', label: korundPlan?.assignment.name ?? 'Assigned work', detail: korundPlan ? `${korundPlan.assignment.capacityCost} WC · ${(korundPlan.assignment.wageMinor / 100).toFixed(2)} LN · ${korundPlan.assignment.hours} hours` : 'Refresh to load your assignment', onSelect: () => changeView('workplace') },
      { id: 'korund-coupons', label: 'Ration book', detail: korundPlan ? `Game week ${korundPlan.gameWeek} · ${korundPlan.couponFoodRemaining} food coupons` : 'Refresh to load your ration book', onSelect: () => changeView('market') },
      { id: 'korund-food', label: 'Household rations', detail: `${korundPlan?.foodQuantity ?? 0} food`, onSelect: () => changeView('household') },
    ] :
    viewMode === 'household' ? (economy?.inventory ?? []).map(entry => ({
      id: entry.item, label: entry.item[0].toUpperCase() + entry.item.slice(1), detail: `${entry.quantity} available`,
    })) : viewMode === 'workplace' ? availableWorkOrders
      .filter(order => Boolean(citizenNation) && (!order.nationId || order.nationId === citizenNation?.id))
      .map(order => ({ id: order.id, label: order.name,
        detail: `${order.cost} WC · ${order.detail}${rewards[order.id] ? ` · ${(rewards[order.id].wageMinor / 100).toFixed(2)} SPK + ${rewards[order.id].quantity} ${rewards[order.id].item}` : ''}${hasActiveShift ? ' · Shift in progress' : capacity < order.cost ? ' · More capacity needed' : ''}`,
      })) : viewMode === 'market' ? [
        ...(market?.quotes ?? []).map(quote => ({ id: quote.item, label: quote.label,
          detail: `Buy ${(quote.buyMinor / 100).toFixed(2)} · Sell ${(quote.sellMinor / 100).toFixed(2)} SPK · ${quote.stock} in stock`,
        })),
        { id: 'listings', label: 'Citizen listings', detail: `${playerMarket?.listings.filter(lot => lot.status === 'open').length ?? 0} open listings${playerMarket?.available ? '' : ' · Trading unavailable'}` },
      ] : viewMode === 'government' ? (government?.roles ?? []).map(role => ({
        id: role.name, label: role.name, detail: role.controller,
      })) : viewMode === 'world' || viewMode === 'nation' ? worldNations.map(nation => ({
        id: nation.id, label: nation.shortName, selected: nation.id === selected.id, detail: `${nation.capital} · Stability ${nation.stability}`, onSelect: () => selectNation(nation.id),
      })) : viewMode === 'square' ? [
        { id: 'household', label: 'Household', detail: 'Belongings and recovery', onSelect: () => changeView('household') },
        { id: 'workplace', label: 'Workplace', detail: 'Contributions and earnings', onSelect: () => changeView('workplace') },
        { id: 'market', label: citizenNation?.id === 'korund' ? 'State store' : 'Market', detail: citizenNation?.id === 'korund' ? 'Ration coupons and state food' : 'Goods and citizen listings', onSelect: () => changeView('market') },
        { id: 'government', label: 'Government', detail: 'Policy and petitions', onSelect: () => changeView('government') },
      ] : [];
  const contextTitle = citizenNation?.id === 'korund' && viewMode === 'market' ? 'State rations' : citizenNation?.id === 'korund' && viewMode === 'workplace' ? 'Assigned work' : viewMode === 'household' ? 'Belongings' : viewMode === 'workplace' ? 'Available jobs'
    : viewMode === 'market' ? 'Goods and listings' : viewMode === 'government' ? 'Government offices'
      : viewMode === 'world' || viewMode === 'nation' ? 'Nations' : viewMode === 'square' ? 'City destinations' : viewMode === 'country' ? 'Country travel' : 'Household';
  return <>
    {clerkConfigured && <ClerkCitizenSession retryKey={sessionRetry} onHydrate={hydrateCitizen} onStatus={setCitizenSessionStatus} onIdentity={changeCitizenIdentity} />}
    <GameShell guestDemo={guestActive} nationFocusRevision={nationFocusRevision} cameraTourNationId={tourOpen && guestAllowed ? tourFocusNation : null} onUserCamera={stopTour} shortlistIds={shortlistIds} worldClock={guestActive ? undefined : simulation?.clock} view={viewMode} citizenNation={citizenNation} nation={viewMode === 'world' || viewMode === 'nation' || viewMode === 'country' ? selected : citizenNation ?? selected} nations={worldNations} capacity={capacity}
      currencyCode={citizenNation?.id === 'aurelle' ? 'CRN' : citizenNation?.id === 'korund' ? 'LN' : 'SPK'} walletMinor={citizenNation?.id === 'aurelle' ? aurellePlan?.walletMinor : citizenNation?.id === 'korund' ? korundPlan?.walletMinor : economy?.walletMinor} inventory={citizenNation?.id === 'aurelle' ? (aurellePlan ? {food:aurellePlan.foodQuantity,materials:0,knowledge:0} : undefined) : citizenNation?.id === 'korund' ? (korundPlan ? { food: korundPlan.foodQuantity, materials: 0, knowledge: 0 } : undefined) : economy ? {food:goods('food'),materials:goods('materials'),knowledge:goods('knowledge')} : undefined}
      shiftSummary={activeShift ? {title:activeShift.orderName,endsAt:Date.parse(activeShift.completesAt)/1000} : undefined}
      localDemo={!clerkConfigured} noticeKind={workError || governmentError ? 'error' : 'success'} notice={guestActive ? undefined : workError ?? governmentError ?? recentAction ?? undefined} countryMap={countryMap} currentCityName={viewMode === 'nation' ? selected.capital : activeCity?.name} panel={guestActive ? <GuestDemo nationId={selected.id} view={viewMode as GuestDemoView} state={guestState} onAction={actInGuestDemo} onView={changeView} onExit={leaveGuestDemo} /> : gamePanel}
      contextItems={guestActive ? [] : contextItems} contextTitle={guestActive ? 'Guest examples' : contextTitle}
      onNavigate={navigateGame} onSelectNation={selectNation}
      accountControls={<ClerkAccountControl />} />
      {pendingNation && <CitizenshipDialog key={`${citizenSessionKey}:${pendingNation.id}`} nation={pendingNation} reviewStorageKey={reviewStorageKey} currentNationName={citizenNation?.name} expectedNationId={enrollmentExpectedNation}
        session={clerkConfigured ? citizenSessionStatus : 'ready'} pending={enrollmentPending} error={enrollmentError}
        onRetrySession={() => setSessionRetry(value=>value+1)} onClose={() => { if (!enrollmentLock.current) closeEnrollmentReview(); }}
        onConfirm={() => void confirmEnrollment(pendingNation)}
        signInControl={<><SignInButton mode="modal"><button type="button">Sign in to continue</button></SignInButton>{guestEntry}</>} />}

  </>;
}
