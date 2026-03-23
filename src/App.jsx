import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Camera,
  Search,
  Plus,
  Trash2,
  Pencil,
  LogOut,
  Filter,
  X,
  Image as ImageIcon,
  MapPin,
  Hash,
  List,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Settings,
  History,
} from "lucide-react";
import { APP_VERSION } from "./version";

const SUPABASE_URL = "https://qhnfwpwqrdtlyligeeiw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0B0FwcIZqs1oaW0Zcov9Eg_iWVbN_8j";

const isSupabaseConfigured =
  !!SUPABASE_URL &&
  !!SUPABASE_ANON_KEY &&
  SUPABASE_URL.startsWith("https://");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const base = import.meta.env.BASE_URL;

const ROLE_LABELS = {
  super_admin: "Super admin",
  admin: "Admin",
  user: "Utilisateur",
};

const ROLE_COLORS = {
  super_admin: "bg-red-100 text-red-700 border-red-200",
  admin: "bg-amber-100 text-amber-700 border-amber-200",
  user: "bg-slate-100 text-slate-700 border-slate-200",
};

const DEFAULT_ROOM_LABEL = "Pièce indéfinie";

const SORT_OPTIONS = [
  { value: "created_desc", label: "Plus récents" },
  { value: "created_asc", label: "Plus anciens" },
  { value: "name_asc", label: "Nom A → Z" },
  { value: "name_desc", label: "Nom Z → A" },
  { value: "reference_asc", label: "Référence" },
];

const PAGE_SIZE_OPTIONS = [12, 24, 48, 100];

const emptyForm = {
  name: "",
  description: "",
  room: "",
  reference: "",
  tagsInput: "",
  is_donation: false,
  donation_number: "",
  donation_date: "",
  donor_name: "",
};

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function inputClass(darkMode) {
  return cn(
    "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
    darkMode
      ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400 focus:border-slate-500"
      : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
  );
}

function selectClass(darkMode) {
  return cn(
    "w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
    darkMode
      ? "border-slate-700 bg-slate-800 text-slate-100 focus:border-slate-500"
      : "border-slate-200 bg-slate-50 text-slate-900 focus:border-slate-400"
  );
}

function normalizeTags(input) {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
        .filter(Boolean)
    ),
  ];
}

async function resizeToSquare800(file) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = objectUrl;
    });

    const size = 800;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible.");

    const crop = Math.min(img.width, img.height);
    const sx = (img.width - crop) / 2;
    const sy = (img.height - crop) / 2;

    ctx.drawImage(img, sx, sy, crop, crop, 0, 0, size, size);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("Conversion image impossible."));
        },
        "image/jpeg",
        0.75
      );
    });

    canvas.width = 1;
    canvas.height = 1;

    return new File([blob], `object-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getChangedFields(oldData, newData) {
  if (!oldData || !newData) return [];

  const ignoredFields = ["updated_at", "created_at", "photo_path"];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changes = [];

  for (const key of keys) {
    if (ignoredFields.includes(key)) continue;

    const before = oldData[key];
    const after = newData[key];

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({ field: key, before, after });
    }
  }

  return changes;
}

function formatHistoryValue(value) {
  if (value === null || value === undefined || value === "") return "vide";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function actionLabel(action) {
  switch (action) {
    case "create":
      return "a créé la fiche";
    case "update":
      return "a modifié la fiche";
    case "delete":
      return "a supprimé la fiche";
    default:
      return "a effectué une action";
  }
}

function getPublicImageUrl(path) {
  if (!path) return null;
  return supabase.storage.from("museum-photos").getPublicUrl(path).data.publicUrl;
}

function getLockState(locks, objectId, currentUserId) {
  const activeLock = (locks || []).find((lock) => lock.object_id === objectId);
  const isLockedByOther = !!activeLock && activeLock.locked_by !== currentUserId;
  return { activeLock, isLockedByOther };
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [objects, setObjects] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showChangelog, setShowChangelog] = useState(false);
  const [objectHistory, setObjectHistory] = useState([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [globalHistory, setGlobalHistory] = useState([]);
  const [objectLocks, setObjectLocks] = useState([]);

  const [viewMode, setViewMode] = useState("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [donationFilter, setDonationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_desc");

  const [selectedObject, setSelectedObject] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [editingObject, setEditingObject] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("museum-dark-mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roomFilter, donationFilter, sortBy, viewMode, itemsPerPage]);

  useEffect(() => {
    try {
      localStorage.setItem("museum-dark-mode", String(darkMode));
      document.documentElement.classList.toggle("dark", darkMode);
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    if (!session?.user) return;

    loadObjectLocks().catch(console.error);
    const interval = setInterval(() => {
      loadObjectLocks().catch(console.error);
    }, 10000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    const hasModalOpen =
      settingsOpen ||
      !!formMode ||
      showChangelog ||
      historyModalOpen ||
      detailsModalOpen;

    document.body.style.overflow = hasModalOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [settingsOpen, formMode, showChangelog, historyModalOpen, detailsModalOpen]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setObjects([]);
      setRooms([]);
      setLoading(false);
      return;
    }

    bootstrap();
  }, [session]);

  useEffect(() => {
    if (!selectedObject?.id) {
      setObjectHistory([]);
      return;
    }

    loadObjectHistory(selectedObject.id).catch((e) => {
      console.error("Erreur chargement historique :", e);
    });
  }, [selectedObject]);

  useEffect(() => {
    if (!historyModalOpen) return;

    loadGlobalHistory().catch((e) => {
      console.error("Erreur chargement journal global :", e);
    });
  }, [historyModalOpen]);

  useEffect(() => {
    if (!formMode || !editingObject?.id || !session?.user) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

      await supabase.from("museum_object_locks").upsert({
        object_id: editingObject.id,
        locked_by: session.user.id,
        locked_by_name: profile?.display_name || session.user.email,
        locked_at: now.toISOString(),
        expires_at: expiresAt,
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [formMode, editingObject, session, profile]);

  async function loadObjectLocks() {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("museum_object_locks")
      .select("*")
      .gt("expires_at", nowIso);

    if (error) throw error;

    const locks = data || [];
    setObjectLocks(locks);
    return locks;
  }

  async function lockObject(item) {
    if (!session?.user) {
      return { ok: false, reason: "not-authenticated" };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const freshLocks = await loadObjectLocks();

    const existingLock = freshLocks.find(
      (lock) =>
        lock.object_id === item.id && new Date(lock.expires_at).getTime() > Date.now()
    );

    if (existingLock && existingLock.locked_by !== session.user.id) {
      return {
        ok: false,
        reason: "locked",
        lockedByName: existingLock.locked_by_name || "Utilisateur inconnu",
      };
    }

    const { error } = await supabase.from("museum_object_locks").upsert({
      object_id: item.id,
      locked_by: session.user.id,
      locked_by_name: profile?.display_name || session.user.email,
      locked_at: now.toISOString(),
      expires_at: expiresAt,
    });

    if (error) {
      return {
        ok: false,
        reason: "db-error",
        message: error.message,
      };
    }

    await loadObjectLocks();
    return { ok: true };
  }

  async function unlockObject(objectId) {
    if (!session?.user || !objectId) return;

    await supabase
      .from("museum_object_locks")
      .delete()
      .eq("object_id", objectId)
      .eq("locked_by", session.user.id);

    await loadObjectLocks();
  }

  async function bootstrap() {
    try {
      setLoading(true);
      setError("");
      await Promise.all([loadProfile(), loadObjects(), loadRooms(), loadObjectLocks()]);
    } catch (e) {
      setError(e.message || "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadGlobalHistory() {
    const { data, error } = await supabase
      .from("museum_object_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    setGlobalHistory(data || []);
  }

  async function loadObjectHistory(objectId) {
    const { data, error } = await supabase
      .from("museum_object_history")
      .select("*")
      .eq("object_id", objectId)
      .order("changed_at", { ascending: false });

    if (error) throw error;
    setObjectHistory(data || []);
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) throw error;
    setProfile(data);
  }

  async function loadObjects() {
    const { data, error } = await supabase
      .from("museum_objects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    setObjects(data || []);
  }

  async function loadRooms() {
    const { data, error } = await supabase
      .from("museum_rooms")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;
    setRooms(data || []);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isSuperAdmin = profile?.role === "super_admin";
  const isAdmin = profile?.role === "admin";

  const canAdd = isAdmin || isSuperAdmin;
  const canEdit = isAdmin || isSuperAdmin;
  const canDelete = isSuperAdmin;
  const canManageSettings = isSuperAdmin;
  const canViewHistory = canEdit || canDelete || canManageSettings;

  const filteredObjects = useMemo(() => {
    let list = [...objects];
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter((item) => {
        const haystack = [
          item.name,
          item.description,
          item.room,
          item.reference,
          item.donor_name,
          ...(item.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    if (roomFilter !== "all") {
      list = list.filter((item) => item.room === roomFilter);
    }

    if (donationFilter === "don") {
      list = list.filter((item) => item.is_donation);
    } else if (donationFilter === "nodon") {
      list = list.filter((item) => !item.is_donation);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "", "fr");
        case "name_desc":
          return (b.name || "").localeCompare(a.name || "", "fr");
        case "reference_asc":
          return (a.reference || "").localeCompare(b.reference || "", "fr");
        case "created_desc":
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return list;
  }, [objects, search, roomFilter, donationFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredObjects.length / itemsPerPage));

  const paginatedObjects = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = currentPage * itemsPerPage;
    return filteredObjects.slice(start, end);
  }, [filteredObjects, currentPage, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  async function handleDelete(item) {
    const { isLockedByOther, activeLock } = getLockState(
      objectLocks,
      item.id,
      session?.user?.id
    );

    if (isLockedByOther) {
      setError(
        `Suppression impossible : fiche verrouillée par ${
          activeLock?.locked_by_name || "un autre utilisateur"
        }.`
      );
      return;
    }

    const ok = window.confirm(`Supprimer la fiche « ${item.name} » ?`);
    if (!ok) return;

    try {
      setError("");
      setInfo("");

      if (item.photo_path) {
        await supabase.storage.from("museum-photos").remove([item.photo_path]);
      }

      const { error } = await supabase.from("museum_objects").delete().eq("id", item.id);

      if (error) throw error;

      setObjects((prev) => prev.filter((obj) => obj.id !== item.id));
      if (selectedObject?.id === item.id) {
        setSelectedObject(null);
        setDetailsModalOpen(false);
      }
      setInfo("Fiche supprimée.");
    } catch (e) {
      setError(e.message || "Suppression impossible.");
    }
  }

  function openCreate() {
    setEditingObject(null);
    setFormMode("create");
  }

  async function openDetails(item) {
    setSelectedObject(item);
    setDetailsModalOpen(true);
  }

  async function openEdit(item) {
    const result = await lockObject(item);

    if (!result.ok) {
      if (result.reason === "locked") {
        setError(`Cette fiche est en cours de modification par ${result.lockedByName}.`);
        return;
      }

      setError(result.message || "Impossible de verrouiller la fiche.");
      return;
    }

    setEditingObject(item);
    setFormMode("edit");
  }

  async function handleSaved(saved, mode) {
    if (mode === "create") {
      setObjects((prev) => [saved, ...prev]);
      setInfo("Fiche ajoutée avec succès.");
    } else {
      setObjects((prev) => prev.map((obj) => (obj.id === saved.id ? saved : obj)));
      setSelectedObject((prev) => (prev?.id === saved.id ? saved : prev));
      setInfo("Fiche modifiée avec succès.");
    }

    await unlockObject(saved.id);
    setFormMode(null);
    setEditingObject(null);
  }

  if (!isSupabaseConfigured) {
    return <ConfigurationScreen />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className={cn("min-h-screen", darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900")}>
      <TopBar
        profile={profile}
        onSignOut={signOut}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        canManageSettings={canManageSettings}
        onOpenSettings={() => setSettingsOpen(true)}
        canViewHistory={canViewHistory}
        onOpenHistory={() => setHistoryModalOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <section className="mb-6 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className={cn("rounded-3xl border p-4 shadow-sm sm:p-5", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Inventaire du musée</h1>
                <p className={cn("mt-1 text-sm", darkMode ? "text-slate-400" : "text-slate-600")}>
                  Recherche, tri, consultation et gestion des fiches objets.
                </p>
              </div>

              {canAdd && (
                <button
                  onClick={openCreate}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus size={18} />
                  Ajouter une fiche
                </button>
              )}
            </div>
          </div>

          <div className={cn("rounded-3xl border p-4 shadow-sm sm:p-5", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
            <div className="flex items-start gap-3">
              <div className={cn("rounded-2xl border px-3 py-2 text-xs font-semibold", ROLE_COLORS[profile?.role] || ROLE_COLORS.user)}>
                {ROLE_LABELS[profile?.role] || "Utilisateur"}
              </div>

              <div className="min-w-0">
                <p className={cn("truncate text-sm font-medium", darkMode ? "text-slate-100" : "text-slate-900")}>
                  {profile?.display_name || session.user.email}
                </p>
                <p className={cn("truncate text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
                  {session.user.email}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <StatCard label="Objets" value={objects.length} darkMode={darkMode} />
              <StatCard label="Dons" value={objects.filter((o) => o.is_donation).length} darkMode={darkMode} />
              <StatCard label="Salles" value={[...new Set(objects.map((o) => o.room).filter(Boolean))].length} darkMode={darkMode} />
            </div>
          </div>
        </section>

        {(error || info) && (
          <div className="mb-4 space-y-2">
            {error && <Alert type="error" message={error} onClose={() => setError("")} />}
            {info && <Alert type="info" message={info} onClose={() => setInfo("")} />}
          </div>
        )}

        <section className={cn("mb-6 rounded-3xl border p-4 shadow-sm sm:p-5", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="relative xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par nom, référence, mot-clé, salle..."
                className={cn(
                  "w-full rounded-2xl border py-3 pl-10 pr-4 text-sm outline-none ring-0 transition",
                  darkMode
                    ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400 focus:border-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
                )}
              />
            </div>

            <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className={selectClass(darkMode)}>
              <option value="all">Toutes les pièces</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.name}>
                  {room.name}
                </option>
              ))}
            </select>

            <select value={donationFilter} onChange={(e) => setDonationFilter(e.target.value)} className={selectClass(darkMode)}>
              <option value="all">Tous les objets</option>
              <option value="don">Dons uniquement</option>
              <option value="nodon">Hors dons</option>
            </select>

            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass(darkMode)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition",
                  viewMode === "grid"
                    ? darkMode
                      ? "border-slate-500 bg-slate-700 text-slate-100"
                      : "border-slate-900 bg-slate-900 text-white"
                    : darkMode
                    ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <LayoutGrid size={16} />
                Cartes
              </button>

              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition",
                  viewMode === "list"
                    ? darkMode
                      ? "border-slate-500 bg-slate-700 text-slate-100"
                      : "border-slate-900 bg-slate-900 text-white"
                    : darkMode
                    ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <List size={16} />
                Liste
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="text-sm">
                <span className={cn(darkMode ? "text-slate-400" : "text-slate-500")}>Affichage : </span>
                <span className="font-semibold">{filteredObjects.length}</span>
                <span className={cn("ml-1", darkMode ? "text-slate-400" : "text-slate-500")}>objet(s)</span>
              </div>

              <div className="flex items-center gap-2">
                <span className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Par page</span>
                <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} className={selectClass(darkMode)}>
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <LoadingState darkMode={darkMode} />
        ) : filteredObjects.length === 0 ? (
          <EmptyState onAdd={canAdd ? openCreate : null} darkMode={darkMode} />
        ) : (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {paginatedObjects.map((item) => (
                  <ObjectCard
                    key={item.id}
                    item={item}
                    onOpen={() => openDetails(item)}
                    onEdit={() => openEdit(item)}
                    onDelete={() => handleDelete(item)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    darkMode={darkMode}
                    locks={objectLocks}
                    currentUserId={session.user.id}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedObjects.map((item) => (
                  <ObjectListRow
                    key={item.id}
                    item={item}
                    onOpen={() => openDetails(item)}
                    onEdit={() => openEdit(item)}
                    onDelete={() => handleDelete(item)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    darkMode={darkMode}
                    locks={objectLocks}
                    currentUserId={session.user.id}
                  />
                ))}
              </div>
            )}

            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredObjects.length}
              itemsPerPage={itemsPerPage}
              onPrev={() => setCurrentPage((p) => Math.max(1, p - 1))}
              onNext={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              onGoToPage={setCurrentPage}
              darkMode={darkMode}
            />
          </>
        )}
      </main>

      <footer className="px-4 pb-6 text-center sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setShowChangelog(true)}
          className={cn(
            "text-xs underline underline-offset-2 transition",
            darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
          )}
        >
          {`V${APP_VERSION.version} du ${APP_VERSION.date} by ${APP_VERSION.author}`}
        </button>
      </footer>

      {detailsModalOpen && selectedObject && (
        <DetailsModal
          item={selectedObject}
          history={objectHistory}
          onClose={() => {
            setDetailsModalOpen(false);
            setSelectedObject(null);
          }}
          onEdit={() => selectedObject && openEdit(selectedObject)}
          onDelete={() => selectedObject && handleDelete(selectedObject)}
          canEdit={canEdit}
          canDelete={canDelete}
          darkMode={darkMode}
          locks={objectLocks}
          currentUserId={session.user.id}
        />
      )}

      {formMode && (
        <ObjectFormModal
          mode={formMode}
          currentUserId={session.user.id}
          initialData={editingObject}
          rooms={rooms}
          darkMode={darkMode}
          onClose={async () => {
            await unlockObject(editingObject?.id);
            setFormMode(null);
            setEditingObject(null);
          }}
          onSaved={handleSaved}
        />
      )}

      {settingsOpen && canManageSettings && (
        <RoomsSettingsModal
          rooms={rooms}
          darkMode={darkMode}
          onClose={() => setSettingsOpen(false)}
          onChanged={async () => {
            await Promise.all([loadRooms(), loadObjects()]);
          }}
        />
      )}

      {showChangelog && <ChangelogModal darkMode={darkMode} onClose={() => setShowChangelog(false)} />}

      {historyModalOpen && (
        <GlobalHistoryModal history={globalHistory} darkMode={darkMode} onClose={() => setHistoryModalOpen(false)} />
      )}
    </div>
  );
}

function ConfigurationScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">Configuration Supabase requise</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Remplace les constantes <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> dans le code. Ensuite,
          crée les tables <code>profiles</code>, <code>museum_objects</code> et <code>museum_rooms</code>, puis le
          bucket <code>museum-photos</code>.
        </p>
      </div>
    </div>
  );
}

function AuthScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  function normalizeLoginToEmail(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return "";
    if (trimmed.includes("@")) return trimmed;
    return `${trimmed}@musee.fr`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setAuthError("");

    try {
      const email = normalizeLoginToEmail(identifier);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    } catch (e) {
      setAuthError(e.message || "Authentification impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div
          className="relative overflow-hidden rounded-[2rem] border border-white/10 p-8 text-white shadow-2xl sm:p-10"
          style={{
            backgroundImage: `linear-gradient(rgba(2,6,23,0.76), rgba(2,6,23,0.88)), url('${base}login-bg.jpg')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur">
            <img src={`${base}icon.png`} alt="Icône musée" className="h-10 w-10 rounded-xl object-cover" />
            <div>
              <p className="text-lg font-bold">Inventaire musée</p>
              <p className="text-xs text-slate-300">Musée du Combattant de la Haute-Saône</p>
            </div>
          </div>

          <div className="mt-10 flex justify-center">
            <img
              src={`${base}icon.png`}
              alt="Logo musée"
              className="w-full max-w-[360px] rounded-[2rem] border border-white/20 bg-white/90 p-4 shadow-2xl"
            />
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Connexion</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-100">Accès à l’inventaire</h2>
            <p className="mt-2 text-sm text-slate-400">Connecte-toi avec ton identifiant musée ou ton adresse e-mail.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Identifiant ou adresse e-mail" darkMode>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className={inputClass(true)}
                placeholder="prenom.nom ou email"
                autoComplete="username"
                required
              />
            </Field>

            <Field label="Mot de passe" darkMode>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass(true)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>

            {authError && <Alert type="error" message={authError} onClose={() => setAuthError("")} />}

            <button
              disabled={loading}
              className="w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
            >
              {loading ? "Chargement..." : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function TopBar({
  profile,
  onSignOut,
  darkMode,
  onToggleDarkMode,
  canManageSettings,
  onOpenSettings,
  onOpenHistory,
  canViewHistory,
}) {
  return (
    <header className={cn("sticky top-0 z-30 border-b backdrop-blur", darkMode ? "border-slate-800 bg-slate-900/90" : "border-slate-200 bg-white/90")}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border p-1 shadow-sm", darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white")}>
            <img src={`${base}icon.png`} alt="Logo musée" className="h-full w-full object-contain" />
          </div>

          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-sm font-semibold">Catalogue du musée</p>
            <p className={cn("truncate text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
              Gestion des fiches objets du Musée du Combattant de la Haute-Saône
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {canManageSettings && (
            <button
              onClick={onOpenSettings}
              className={cn(
                "rounded-2xl border px-3 py-2 text-sm font-medium transition",
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <span className="sm:hidden"><Settings size={16} /></span>
              <span className="hidden sm:inline">⚙️ Réglages</span>
            </button>
          )}

          {canViewHistory && (
            <button
              onClick={onOpenHistory}
              className={cn(
                "rounded-2xl border px-3 py-2 text-sm font-medium transition",
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <span className="sm:hidden"><History size={16} /></span>
              <span className="hidden sm:inline">🕘 Journal</span>
            </button>
          )}

          <button
            onClick={onToggleDarkMode}
            className={cn(
              "rounded-2xl border px-3 py-2 text-sm font-medium transition",
              darkMode
                ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <span className="sm:hidden">{darkMode ? "☀️" : "🌙"}</span>
            <span className="hidden sm:inline">{darkMode ? "☀️ Clair" : "🌙 Sombre"}</span>
          </button>

          <div className={cn("hidden rounded-2xl border px-3 py-2 text-xs font-semibold md:block", ROLE_COLORS[profile?.role] || ROLE_COLORS.user)}>
            {ROLE_LABELS[profile?.role] || "Utilisateur"}
          </div>

          <button
            onClick={onSignOut}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition",
              darkMode
                ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function ObjectCard({ item, onOpen, onEdit, onDelete, canEdit, canDelete, darkMode, locks, currentUserId }) {
  const imageUrl = getPublicImageUrl(item.photo_path);
  const { activeLock, isLockedByOther } = getLockState(locks, item.id, currentUserId);

  return (
    <article className={cn("overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white", isLockedByOther && "opacity-60")}>
      <button onClick={onOpen} className="block w-full text-left">
        <div className={cn("aspect-square", darkMode ? "bg-slate-800" : "bg-slate-100")}>
          {imageUrl ? (
            <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <ImageIcon size={40} />
            </div>
          )}
        </div>

        <div className={cn("space-y-3 p-4", darkMode ? "text-slate-100" : "text-slate-900")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className={cn("truncate text-base font-bold", darkMode ? "text-slate-100" : "text-slate-900")}>{item.name}</h3>
              <p className={cn("mt-1 truncate text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>{item.reference}</p>
            </div>
            {item.is_donation && <span className="rounded-xl bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Don</span>}
          </div>

          {isLockedByOther && (
            <div className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Verrouillée par {activeLock?.locked_by_name || "un autre utilisateur"}
            </div>
          )}

          <div className={cn("space-y-2 text-sm", darkMode ? "text-slate-300" : "text-slate-600")}>
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-slate-400" />
              <span className="truncate">{item.room || DEFAULT_ROOM_LABEL}</span>
            </div>
            <div className={cn("line-clamp-2 min-h-[2.5rem] text-sm leading-5", darkMode ? "text-slate-300" : "text-slate-600")}>
              {item.description || "Aucune description."}
            </div>
          </div>

          {(item.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.slice(0, 4).map((tag) => (
                <span key={tag} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", darkMode ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700")}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {(canEdit || canDelete) && (
        <div className={cn("flex gap-2 border-t px-4 py-3", darkMode ? "border-slate-800" : "border-slate-100")}>
          {canEdit && (
            <button
              onClick={onEdit}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                darkMode ? "border-slate-700 text-slate-100 hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
              disabled={isLockedByOther}
            >
              <Pencil size={16} />
              Modifier
            </button>
          )}

          {canDelete && (
            <button
              onClick={onDelete}
              disabled={isLockedByOther}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={16} />
              Supprimer
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function ObjectListRow({
  item,
  onOpen,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  darkMode,
  locks,
  currentUserId,
}) {
  const activeLock = (locks || []).find((lock) => lock.object_id === item.id);
  const isLockedByOther = activeLock && activeLock.locked_by !== currentUserId;

  const imageUrl = item.photo_path
    ? supabase.storage.from("museum-photos").getPublicUrl(item.photo_path).data
        .publicUrl
    : null;

  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-sm",
        darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white",
        isLockedByOther && "opacity-60"
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "h-16 w-16 shrink-0 overflow-hidden rounded-2xl border",
                darkMode
                  ? "border-slate-700 bg-slate-800"
                  : "border-slate-200 bg-slate-100"
              )}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <ImageIcon size={20} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold">{item.name}</h3>

                {item.is_donation && (
                  <span className="rounded-xl bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Don
                  </span>
                )}

                {isLockedByOther && (
                  <span className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Verrouillée par{" "}
                    {activeLock?.locked_by_name || "un autre utilisateur"}
                  </span>
                )}
              </div>

              <p
                className={cn(
                  "mt-1 text-sm",
                  darkMode ? "text-slate-400" : "text-slate-500"
                )}
              >
                {item.reference || "Sans référence"} •{" "}
                {item.room || DEFAULT_ROOM_LABEL}
              </p>

              <p
                className={cn(
                  "mt-1 line-clamp-2 text-sm",
                  darkMode ? "text-slate-300" : "text-slate-600"
                )}
              >
                {item.description || "Aucune description."}
              </p>
            </div>
          </div>
        </button>

        {(canEdit || canDelete) && (
          <div className="flex gap-2">
            {canEdit && (
              <button
                onClick={onEdit}
                disabled={isLockedByOther}
                className={cn(
                  "rounded-2xl border px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
                  darkMode
                    ? "border-slate-700 text-slate-100 hover:bg-slate-800"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                Modifier
              </button>
            )}

            {canDelete && (
              <button
                onClick={onDelete}
                disabled={isLockedByOther}
                className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Supprimer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailsModal({ item, history, onClose, onEdit, onDelete, canEdit, canDelete, darkMode, locks, currentUserId }) {
  const [historyVisible, setHistoryVisible] = useState(false);
  const imageUrl = getPublicImageUrl(item.photo_path);
  const { activeLock, isLockedByOther } = getLockState(locks, item.id, currentUserId);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
      <div className={cn("flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl", darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900")}>
        <div className={cn("flex items-center justify-between border-b px-5 py-4", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div>
            <h2 className="text-lg font-bold">Fiche objet</h2>
            <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>Consultation détaillée</p>
          </div>
          <button onClick={onClose} className={cn("rounded-2xl p-2 transition", darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[minmax(320px,45%)_1fr]">
  <div className={cn("flex items-center justify-center p-4 lg:min-h-[520px]", darkMode ? "bg-slate-800" : "bg-slate-100")}>
    {imageUrl ? (
      <img
        src={imageUrl}
        alt={item.name}
        className="max-h-[70vh] w-full object-contain"
      />
    ) : (
      <div className="flex h-full min-h-[320px] w-full items-center justify-center text-slate-400">
                  <ImageIcon size={44} />
                </div>
              )}
            </div>

            <div className={cn("space-y-5 p-5", darkMode ? "text-slate-100" : "text-slate-900")}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold leading-tight">{item.name}</h3>
                  {item.is_donation && <span className="rounded-xl bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Don</span>}
                  {isLockedByOther && (
                    <span className="rounded-xl bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      Verrouillée par {activeLock?.locked_by_name || "un autre utilisateur"}
                    </span>
                  )}
                </div>
                <p className={cn("mt-1 text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Réf. {item.reference || "Non renseignée"}</p>
              </div>

              <InfoRow icon={<MapPin size={16} />} label="Pièce" value={item.room || DEFAULT_ROOM_LABEL} darkMode={darkMode} />

              <InfoRow
                icon={<Hash size={16} />}
                label="Mots-clés"
                value={(item.tags || []).length ? item.tags.map((t) => `#${t}`).join(" ") : "Aucun"}
                darkMode={darkMode}
              />

              <div>
                <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", darkMode ? "text-slate-400" : "text-slate-500")}>Descriptif</p>
                <p className={cn("rounded-2xl p-4 text-sm leading-6", darkMode ? "bg-slate-800 text-slate-200" : "bg-slate-50 text-slate-700")}>
                  {item.description || "Aucune description enregistrée."}
                </p>
              </div>

              {item.is_donation && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-emerald-800">
                    <Hash size={16} />
                    <p className="text-sm font-semibold">Informations de don</p>
                  </div>
                  <div className="space-y-2 text-sm text-emerald-900">
                    <p><span className="font-medium">Numéro :</span> {item.donation_number || "Non renseigné"}</p>
                    <p><span className="font-medium">Date :</span> {item.donation_date || "Non renseignée"}</p>
                    <p><span className="font-medium">Donateur :</span> {item.donor_name || "Non renseigné"}</p>
                  </div>
                </div>
              )}

              {(canEdit || canDelete) && (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {canEdit && (
      <button
        onClick={onEdit}
        disabled={isLockedByOther}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
          darkMode
            ? "border-slate-700 text-slate-100 hover:bg-slate-800"
            : "border-slate-200 text-slate-700 hover:bg-slate-50"
        )}
      >
        <Pencil size={16} />
        Modifier la fiche
      </button>
    )}

    {canDelete && (
      <button
        onClick={onDelete}
        disabled={isLockedByOther}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={16} />
        Supprimer
      </button>
    )}

    <button
      type="button"
      onClick={() => setHistoryVisible((prev) => !prev)}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition sm:col-span-2",
        darkMode
          ? "border-slate-700 text-slate-100 hover:bg-slate-800"
          : "border-slate-200 text-slate-700 hover:bg-slate-50"
      )}
    >
      <History size={16} />
      {historyVisible ? "Masquer l’historique" : "Afficher l’historique"}
    </button>
  </div>
)}

{historyVisible && <HistoryPanel history={history || []} darkMode={darkMode} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectFormModal({ mode, initialData, onClose, onSaved, currentUserId, rooms, darkMode }) {
  const [form, setForm] = useState(() => {
    if (!initialData) return emptyForm;
    return {
      name: initialData.name || "",
      description: initialData.description || "",
      room: initialData.room || "",
      reference: initialData.reference || "",
      tagsInput: (initialData.tags || []).map((t) => `#${t}`).join(" "),
      is_donation: !!initialData.is_donation,
      donation_number: initialData.donation_number || "",
      donation_date: initialData.donation_date || "",
      donor_name: initialData.donor_name || "",
    };
  });

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(() => {
    if (initialData?.photo_path) {
      return getPublicImageUrl(initialData.photo_path);
    }
    return "";
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleImageChange(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    setError("");

    const resized = await resizeToSquare800(file);
    setImageFile(resized);

    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(resized));
  } catch (e) {
    console.error("Erreur image :", e);
    setError(
      "Impossible de traiter cette photo sur cet appareil. Essaie via la galerie."
    );
  }
}

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        room: form.room || null,
        reference: form.reference.trim(),
        tags: normalizeTags(form.tagsInput),
        is_donation: form.is_donation,
        donation_number: form.is_donation ? form.donation_number.trim() : null,
        donation_date: form.is_donation && form.donation_date ? form.donation_date : null,
        donor_name: form.is_donation ? form.donor_name.trim() : null,
      };

      if (!payload.name) throw new Error("Le nom de l'objet est obligatoire.");
      if (!payload.reference) throw new Error("La référence est obligatoire.");

      let record;

      if (mode === "create") {
        const { data, error } = await supabase
          .from("museum_objects")
          .insert({ ...payload, created_by: currentUserId })
          .select("*")
          .single();

        if (error) throw error;
        record = data;
      } else {
        const { data, error } = await supabase
          .from("museum_objects")
          .update(payload)
          .eq("id", initialData.id)
          .select("*")
          .single();

        if (error) throw error;
        record = data;
      }

      if (imageFile) {
        const path = `${record.id}/photo.jpg`;
        const { error: uploadError } = await supabase.storage.from("museum-photos").upload(path, imageFile, {
          upsert: true,
          contentType: "image/jpeg",
        });

        if (uploadError) throw uploadError;

        const { data: updated, error: updatePhotoError } = await supabase
          .from("museum_objects")
          .update({ photo_path: path })
          .eq("id", record.id)
          .select("*")
          .single();

        if (updatePhotoError) throw updatePhotoError;
        record = updated;
      }

      onSaved(record, mode);
    } catch (e) {
      setError(e.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className={cn("max-h-[95vh] w-full max-w-4xl overflow-auto rounded-t-[2rem] border shadow-2xl sm:rounded-[2rem]", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
        <div className={cn("sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 backdrop-blur sm:px-6", darkMode ? "border-slate-800 bg-slate-900/95" : "border-slate-100 bg-white/95")}>
          <div>
            <h2 className={cn("text-lg font-bold", darkMode ? "text-slate-100" : "text-slate-900")}>
              {mode === "create" ? "Ajouter une fiche" : "Modifier la fiche"}
            </h2>
            <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
              Photo 800×800, mots-clés, don et informations détaillées
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nom de l'objet *" darkMode={darkMode}>
                <input value={form.name} onChange={(e) => updateField("name", e.target.value)} className={inputClass(darkMode)} placeholder="Ex. Vase gallo-romain" />
              </Field>

              <Field label="Référence *" darkMode={darkMode}>
                <input value={form.reference} onChange={(e) => updateField("reference", e.target.value)} className={inputClass(darkMode)} placeholder="OBJ-2026-001" />
              </Field>
            </div>

            <Field label="Descriptif" darkMode={darkMode}>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value.slice(0, 500))}
                rows={5}
                className={inputClass(darkMode)}
                placeholder="Décris l'objet en quelques lignes..."
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Pièce du musée" darkMode={darkMode}>
                <select value={form.room} onChange={(e) => updateField("room", e.target.value)} className={selectClass(darkMode)}>
                  <option value="">{DEFAULT_ROOM_LABEL}</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.name}>{room.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Mots-clés / hashtags" darkMode={darkMode}>
                <input
                  value={form.tagsInput}
                  onChange={(e) => updateField("tagsInput", e.target.value)}
                  className={inputClass(darkMode)}
                  placeholder="#romain #bois #religieux"
                />
              </Field>
            </div>

            <div className={cn("rounded-3xl border p-4", darkMode ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-white")}>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.is_donation}
                  onChange={(e) => updateField("is_donation", e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 accent-blue-600"
                />
                <div>
                  <p className={cn("text-sm font-semibold", darkMode ? "text-slate-100" : "text-slate-900")}>Cet objet provient d'un don</p>
                  <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>Affiche les champs donateur, date et numéro de don</p>
                </div>
              </label>

              {form.is_donation && (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Field label="Numéro de don" darkMode={darkMode}>
                    <input value={form.donation_number} onChange={(e) => updateField("donation_number", e.target.value)} className={inputClass(darkMode)} placeholder="DON-014" />
                  </Field>

                  <Field label="Date du don" darkMode={darkMode}>
                    <input type="date" value={form.donation_date} onChange={(e) => updateField("donation_date", e.target.value)} className={inputClass(darkMode)} />
                  </Field>

                  <Field label="Nom du donateur" darkMode={darkMode}>
                    <input value={form.donor_name} onChange={(e) => updateField("donor_name", e.target.value)} className={inputClass(darkMode)} placeholder="Nom / organisme" />
                  </Field>
                </div>
              )}
            </div>

            {error && <Alert type="error" message={error} onClose={() => setError("")} />}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                  darkMode ? "border-slate-700 text-slate-100 hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                )}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : mode === "create" ? "Créer la fiche" : "Enregistrer les modifications"}
              </button>
            </div>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className={cn("overflow-hidden rounded-3xl border shadow-sm", darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white")}>
              <div className={cn("aspect-square", darkMode ? "bg-slate-800" : "bg-slate-100")}>
                {previewUrl ? (
                  <img src={previewUrl} alt="Aperçu" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                    <ImageIcon size={44} />
                    <p className="text-sm">Aucune photo</p>
                  </div>
                )}
              </div>
              <div className="p-4">
                <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition", darkMode ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100")}>
                  <Camera size={16} />
                  Prendre / choisir une photo
                 <input
  type="file"
  accept="image/*"
  onChange={handleImageChange}
  className="hidden"
/>
                </label>
                <p className={cn("mt-3 text-xs leading-5", darkMode ? "text-slate-400" : "text-slate-500")}>
                  L’image est automatiquement recadrée au carré et convertie en 800×800 px.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaginationBar({ currentPage, totalPages, totalItems, itemsPerPage, onPrev, onNext, onGoToPage, darkMode }) {
  if (totalItems === 0) return null;

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const pages = [];
  const pageWindowStart = Math.max(1, currentPage - 2);
  const pageWindowEnd = Math.min(totalPages, currentPage + 2);

  for (let i = pageWindowStart; i <= pageWindowEnd; i += 1) {
    pages.push(i);
  }

  return (
    <div className={cn("mt-6 rounded-3xl border p-4 shadow-sm", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>
          Affichage de <span className="font-semibold text-inherit">{start}</span> à <span className="font-semibold text-inherit">{end}</span> sur <span className="font-semibold text-inherit">{totalItems}</span> objet(s)
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={currentPage === 1}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
              darkMode ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <ChevronLeft size={16} />
            Précédent
          </button>

          {pages.map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => onGoToPage(page)}
              className={cn(
                "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                page === currentPage
                  ? darkMode
                    ? "border-slate-500 bg-slate-700 text-slate-100"
                    : "border-slate-900 bg-slate-900 text-white"
                  : darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            onClick={onNext}
            disabled={currentPage === totalPages}
            className={cn(
              "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
              darkMode ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            Suivant
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ history, darkMode }) {
  return (
    <div className={cn("mt-5 rounded-3xl border p-4", darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
      <h3 className="text-sm font-bold">Historique des modifications</h3>

      <div className="mt-3 space-y-3">
        {history.length === 0 ? (
          <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Aucun historique disponible.</p>
        ) : (
          history.map((entry) => {
            const changes = getChangedFields(entry.old_data, entry.new_data);

            return (
              <div key={entry.id} className={cn("rounded-2xl border p-3 text-sm", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
                <p className="font-semibold">
                  {entry.changed_by_name || "Utilisateur inconnu"} {actionLabel(entry.action)}
                </p>

                <p className={cn("mt-1 text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
                  {new Date(entry.changed_at).toLocaleString("fr-FR")}
                </p>

                {entry.action === "update" && changes.length > 0 && (
                  <ul className="mt-3 space-y-2 text-xs">
                    {changes.map((change) => (
                      <li key={change.field} className="leading-5">
                        <span className="font-semibold">{change.field}</span> : {formatHistoryValue(change.before)} → {formatHistoryValue(change.after)}
                      </li>
                    ))}
                  </ul>
                )}

                {entry.action === "create" && <p className="mt-3 text-xs">Création de la fiche.</p>}
                {entry.action === "delete" && <p className="mt-3 text-xs">Suppression de la fiche.</p>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function GlobalHistoryModal({ history, darkMode, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
      <div className={cn("flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl", darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900")}>
        <div className={cn("flex items-center justify-between border-b px-5 py-4", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div>
            <h2 className="text-lg font-bold">Journal des modifications</h2>
            <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Historique global des actions sur les fiches</p>
          </div>

          <button onClick={onClose} className={cn("rounded-2xl p-2 transition", darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {history.length === 0 ? (
            <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Aucun historique disponible.</p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => {
                const changes = getChangedFields(entry.old_data, entry.new_data);
                const objectName = entry.new_data?.name || entry.old_data?.name || "Objet inconnu";

                return (
                  <div key={entry.id} className={cn("rounded-2xl border p-4", darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold">
                        {entry.changed_by_name || "Utilisateur inconnu"} {actionLabel(entry.action)} — <span className="font-bold">{objectName}</span>
                      </p>

                      <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>
                        {new Date(entry.changed_at).toLocaleString("fr-FR")}
                      </p>
                    </div>

                    {entry.action === "update" && changes.length > 0 && (
                      <ul className="mt-3 space-y-2 text-xs">
                        {changes.map((change) => (
                          <li key={change.field} className="leading-5">
                            <span className="font-semibold">{change.field}</span> : {formatHistoryValue(change.before)} → {formatHistoryValue(change.after)}
                          </li>
                        ))}
                      </ul>
                    )}

                    {entry.action === "create" && <p className="mt-3 text-xs">Création de la fiche.</p>}
                    {entry.action === "delete" && <p className="mt-3 text-xs">Suppression de la fiche.</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangelogModal({ darkMode, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4">
      <div className={cn("flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border shadow-2xl", darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900")}>
        <div className={cn("flex items-center justify-between border-b px-5 py-4", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div>
            <h2 className="text-lg font-bold">Historique des mises à jour</h2>
            <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Évolutions de l’application</p>
          </div>

          <button onClick={onClose} className={cn("rounded-2xl p-2 transition", darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {APP_VERSION.changelog.map((entry) => (
            <div key={`${entry.version}-${entry.date}`} className={cn("rounded-2xl border p-4", darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Version {entry.version} — {entry.date}</div>
                {entry.version === APP_VERSION.version && (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Actuelle</span>
                )}
              </div>

              <ul className="mt-3 space-y-2 text-sm">
                {entry.changes.map((change, index) => (
                  <li key={index}>• {change}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoomsSettingsModal({ rooms, darkMode, onClose, onChanged }) {
  const [newRoom, setNewRoom] = useState("");
  const [renamingRoomId, setRenamingRoomId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleAddRoom() {
    if (!newRoom.trim()) return;
    try {
      setBusy(true);
      setError("");
      const { error } = await supabase.from("museum_rooms").insert({ name: newRoom.trim() });
      if (error) throw error;
      setNewRoom("");
      await onChanged();
    } catch (e) {
      setError(e.message || "Impossible d'ajouter la pièce.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameRoom(room) {
    const nextName = renameValue.trim();

    if (!nextName || nextName === room.name) {
      setRenamingRoomId(null);
      setRenameValue("");
      return;
    }

    try {
      setBusy(true);
      setError("");

      const { error: updateObjectsError } = await supabase.from("museum_objects").update({ room: nextName }).eq("room", room.name);
      if (updateObjectsError) throw updateObjectsError;

      const { error: updateRoomError } = await supabase.from("museum_rooms").update({ name: nextName }).eq("id", room.id);
      if (updateRoomError) throw updateRoomError;

      setRenamingRoomId(null);
      setRenameValue("");
      await onChanged();
    } catch (e) {
      setError(e.message || "Impossible de renommer la pièce.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRoom(roomName) {
    const ok = window.confirm(`Supprimer la pièce « ${roomName} » ? Les objets passeront en pièce indéfinie.`);
    if (!ok) return;

    try {
      setBusy(true);
      setError("");

      const { error: updateError } = await supabase.from("museum_objects").update({ room: null }).eq("room", roomName);
      if (updateError) throw updateError;

      const { error: deleteError } = await supabase.from("museum_rooms").delete().eq("name", roomName);
      if (deleteError) throw deleteError;

      await onChanged();
    } catch (e) {
      setError(e.message || "Impossible de supprimer la pièce.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 sm:flex sm:items-center sm:justify-center sm:p-4">
      <div className={cn("fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[2rem] border shadow-2xl sm:static sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:rounded-[2rem]", darkMode ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900")}>
        <div className={cn("sticky top-0 z-10 flex shrink-0 items-center justify-between border-b px-5 py-4", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div>
            <h2 className="text-lg font-bold">Réglages des pièces</h2>
            <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Ajouter, renommer ou supprimer une pièce.</p>
          </div>

          <button onClick={onClose} className={cn("rounded-2xl p-2 transition", darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-100")}>
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={newRoom}
              onChange={(e) => setNewRoom(e.target.value)}
              placeholder="Nouvelle pièce"
              className={cn(
                "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400"
                  : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
              )}
            />

            <button
              onClick={handleAddRoom}
              disabled={busy}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              Ajouter
            </button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError("")} />}

          <div className="space-y-2">
            {rooms.length === 0 ? (
              <p className={cn("text-sm", darkMode ? "text-slate-400" : "text-slate-500")}>Aucune pièce enregistrée.</p>
            ) : (
              rooms.map((room) => (
                <div key={room.id} className={cn("rounded-2xl border px-4 py-3", darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                  <div className="flex flex-col gap-3">
                    <input
                      value={renamingRoomId === room.id ? renameValue : room.name}
                      onFocus={() => {
                        setRenamingRoomId(room.id);
                        setRenameValue(room.name);
                      }}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
                        darkMode
                          ? "border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400"
                          : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                      )}
                    />

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => handleRenameRoom(room)}
                        disabled={busy}
                        className={cn(
                          "rounded-2xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-60",
                          darkMode ? "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                        )}
                      >
                        Renommer
                      </button>

                      <button
                        onClick={() => handleDeleteRoom(room.name)}
                        disabled={busy}
                        className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, darkMode }) {
  return (
    <div className={cn("rounded-2xl px-3 py-4", darkMode ? "bg-slate-800" : "bg-slate-50")}>
      <p className="text-xl font-bold">{value}</p>
      <p className={cn("text-xs", darkMode ? "text-slate-400" : "text-slate-500")}>{label}</p>
    </div>
  );
}

function Alert({ type = "info", message, onClose }) {
  const styles = type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm", styles)}>
      <p>{message}</p>
      {onClose && (
        <button onClick={onClose} className="rounded-xl p-1 opacity-70 hover:opacity-100">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function Field({ label, children, darkMode = false }) {
  return (
    <label className="block">
      <span className={cn("mb-2 block text-sm font-semibold", darkMode ? "text-slate-100" : "text-slate-800")}>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ onAdd, darkMode }) {
  return (
    <div className={cn("rounded-3xl border border-dashed p-8 text-center shadow-sm", darkMode ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white")}>
      <div className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-2xl", darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-400")}>
        <Filter size={24} />
      </div>
      <h3 className={cn("mt-4 text-lg font-semibold", darkMode ? "text-slate-100" : "text-slate-900")}>Aucun objet trouvé</h3>
      <p className={cn("mt-2 text-sm leading-6", darkMode ? "text-slate-400" : "text-slate-500")}>Modifie les filtres ou ajoute une nouvelle fiche pour commencer l’inventaire.</p>
      {onAdd && (
        <button
          onClick={onAdd}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Plus size={16} />
          Ajouter une fiche
        </button>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, darkMode = false }) {
  return (
    <div className={cn("rounded-2xl p-4", darkMode ? "bg-slate-800" : "bg-slate-50")}>
      <div className={cn("mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide", darkMode ? "text-slate-400" : "text-slate-500")}>
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn("text-sm", darkMode ? "text-slate-100" : "text-slate-800")}>{value}</p>
    </div>
  );
}

function LoadingState({ darkMode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className={cn("overflow-hidden rounded-3xl border shadow-sm", darkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
          <div className={cn("aspect-square animate-pulse", darkMode ? "bg-slate-800" : "bg-slate-100")} />
          <div className="space-y-3 p-4">
            <div className={cn("h-5 animate-pulse rounded-xl", darkMode ? "bg-slate-800" : "bg-slate-100")} />
            <div className={cn("h-4 w-2/3 animate-pulse rounded-xl", darkMode ? "bg-slate-800" : "bg-slate-100")} />
            <div className={cn("h-16 animate-pulse rounded-2xl", darkMode ? "bg-slate-800" : "bg-slate-100")} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;
