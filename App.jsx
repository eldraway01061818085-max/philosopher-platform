
import React, { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

const grades = [
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'أولى بكالوريا',
  'تانية ثانوي أزهر وعام وبكالوريا'
];

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const PHILOSOPHY_IMAGE = '/file_00000000f7a881f4b475ffb6768b5f12.png';

function getCourseImage(course) {
  return /فلسفة|منطق/.test(course.title || '')
    ? PHILOSOPHY_IMAGE
    : '';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('home');
  const [courses, setCourses] = useState([]);
  const [mySubs, setMySubs] = useState([]);
  const [pending, setPending] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(grades[0]);
  const [phone, setPhone] = useState('');

  const [courseTitle, setCourseTitle] = useState('');
  const [courseGrade, setCourseGrade] = useState(grades[0]);
  const [price, setPrice] = useState('');

  const [wallet] = useState(
    import.meta.env.VITE_VODAFONE_CASH_NUMBER || ''
  );

  const [receipt, setReceipt] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [viewingCourse, setViewingCourse] = useState(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!configured) return undefined;

    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (mounted && !error) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (mounted) setSession(nextSession);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (configured) loadCourses();
  }, []);

  useEffect(() => {
    if (session) {
      loadProfile(session);
    } else {
      setProfile(null);
      setMySubs([]);
      setPending([]);
    }
  }, [session]);

  useEffect(() => {
    if (isAdmin) loadPending();
  }, [isAdmin]);

  async function loadProfile(activeSession = session) {
    if (!activeSession) return;

    const userId = activeSession.user.id;

    const [
      { data: profileData, error: profileError },
      { data: subs, error: subsError }
    ] = await Promise.all([
      supabase.from('profiles')
        .select('*')
        .eq('id', userId)
        .single(),

      supabase.from('subscriptions')
        .select('*, courses(title,grade)')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
    ]);

    if (profileError) {
      setMsg('تعذر تحميل الملف الشخصي: ' + profileError.message);
    } else {
      setProfile(profileData);
    }

    if (subsError) {
      setMsg('تعذر تحميل الاشتراكات: ' + subsError.message);
    }

    setMySubs(subs || []);
  }

  async function loadCourses() {
    const { data, error } = await supabase.from('courses')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) {
      setMsg('تعذر تحميل الكورسات: ' + error.message);
    } else {
      setCourses(data || []);
    }
  }

  async function loadPending() {
    const { data, error } = await supabase.from('subscriptions')
      .select('*, profiles(full_name,email), courses(title,grade)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      setMsg('تعذر تحميل طلبات الاشتراك: ' + error.message);
    } else {
      setPending(data || []);
    }
  }

  async function register(event) {
    event.preventDefault();
    setBusy(true);
    setMsg('');

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          grade,
          phone: phone.trim()
        }
      }
    });

    setBusy(false);

    setMsg(error
      ? 'تعذر إنشاء الحساب: ' + error.message
      : 'تم إرسال طلب إنشاء الحساب. افحص بريدك لتأكيده إذا كان تأكيد البريد مفعّلاً.'
    );
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setBusy(false);

    if (!error) {
      setTab('dashboard');
    }

    setMsg(error
      ? 'تعذر تسجيل الدخول: ' + error.message
      : 'تم تسجيل الدخول بنجاح.'
    );
  }

  async function resetPassword() {
    if (!email.trim()) {
      return setMsg('اكتب البريد الإلكتروني أولاً.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: window.location.origin }
    );

    setMsg(error
      ? 'تعذر إرسال رابط الاستعادة: ' + error.message
      : 'إذا كان البريد مسجلاً، فستصلك رسالة استعادة كلمة المرور.'
    );
  }

  async function requestSubscription(event) {
    event.preventDefault();

    if (!receipt || !selectedCourse) {
      return setMsg('اختر الكورس وارفع صورة الإيصال.');
    }

    if (![
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ].includes(receipt.type)) {
      return setMsg('نوع الملف غير مدعوم.');
    }

    if (receipt.size > MAX_RECEIPT_BYTES) {
      return setMsg('حجم الإيصال أكبر من 5 ميجابايت.');
    }

    setBusy(true);
    setMsg('');

    const ext = receipt.name.split('.').pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'bin';

    const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

    const upload = await supabase.storage.from('receipts').upload(
      path,
      receipt,
      { upsert: false, contentType: receipt.type }
    );

    if (upload.error) {
      setBusy(false);
      return setMsg('فشل رفع الإيصال: ' + upload.error.message);
    }

    const { error } = await supabase.from('subscriptions').insert({
      student_id: session.user.id,
      course_id: selectedCourse,
      receipt_path: path,
      transfer_reference: phone.trim(),
      status: 'pending'
    });

    if (error) {
      await supabase.storage.from('receipts').remove([path]);
      setBusy(false);

      return setMsg(
        error.code === '23505'
          ? 'لديك طلب اشتراك قائم أو اشتراك مفعّل لهذا الكورس.'
          : 'فشل إرسال الطلب: ' + error.message
      );
    }

    setBusy(false);
    setMsg('تم إرسال طلب الاشتراك للمراجعة.');
    setReceipt(null);
    setSelectedCourse('');
    await loadProfile();
  }

  async function review(id, status) {
    setBusy(true);

    const { error } = await supabase.from('subscriptions')
      .update({
        status,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id);

    setBusy(false);

    setMsg(error
      ? 'تعذر تحديث الطلب: ' + error.message
      : 'تم تحديث حالة الطلب.'
    );

    await Promise.all([loadPending(), loadCourses()]);
  }

  async function openReceipt(path) {
    const { data, error } = await supabase.storage.from('receipts')
      .createSignedUrl(path, 60);

    if (error) {
      return setMsg('تعذر فتح الإيصال: ' + error.message);
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function addCourse(event) {
    event.preventDefault();
    setBusy(true);

    const { error } = await supabase.from('courses').insert({
      title: courseTitle.trim(),
      grade: courseGrade,
      price: Number(price),
      active: true
    });

    setBusy(false);

    setMsg(error
      ? 'تعذرت إضافة الكورس: ' + error.message
      : 'تمت إضافة الكورس.'
    );

    if (!error) {
      setCourseTitle('');
      setPrice('');
      await loadCourses();
    }
  }

  async function addLesson(event) {
    event.preventDefault();
    setBusy(true);

    const form = event.currentTarget;
    const fd = new FormData(form);

    const { error } = await supabase.from('lessons').insert({
      course_id: fd.get('course'),
      title: String(fd.get('title')).trim(),
      video_url: String(fd.get('url')).trim(),
      sort_order: Number(fd.get('order') || 0)
    });

    setBusy(false);

    setMsg(error
      ? 'تعذرت إضافة الدرس: ' + error.message
      : 'تمت إضافة الدرس.'
    );

    if (!error) form.reset();
  }

  function browseCourse(course) {
    setViewingCourse(course);
    setTab('course');
    setMsg('');
  }

  function subscribeToCourse(course) {
    setSelectedCourse(course.id);
    setTab('dashboard');

    if (!session) {
      setMsg('سجّل الدخول أولاً، وبعدها ستجد الكورس محدداً في طلب الاشتراك.');
    } else {
      setMsg('الكورس تم اختياره. ارفع إيصال التحويل لإرسال طلب الاشتراك.');
    }
  }

  if (!configured) {
    return (
      <main className="setup">
        <div className="panel">
          <h1>منصة الفيلسوف محمود حسن</h1>
          <h2>إعداد الاتصال بقاعدة البيانات</h2>
          <p>
            أضف رابط مشروع Supabase ومفتاح anon/public
            في متغيرات البيئة ثم أعد تشغيل المشروع.
          </p>
          <p>
            لا تضع مفتاح Service Role في الواجهة.
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <span className="mark">ف</span>
          <div>
            <b>منصة الفيلسوف محمود حسن</b>
            <small>الفلسفة والمنطق • المنهج المصري</small>
          </div>
        </div>

        <nav>
          <button onClick={() => setTab('home')}>الرئيسية</button>

          {session && (
            <button onClick={() => setTab('dashboard')}>
              لوحتي
            </button>
          )}

          {isAdmin && (
            <button onClick={() => setTab('admin')}>
              الإدارة
            </button>
          )}

          {session && (
            <button
              className="outline"
              onClick={() => supabase.auth.signOut()}
            >
              خروج
            </button>
          )}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">تعلم • تدرب • تفوق</p>
        <h1>فهم الفلسفة يبدأ من هنا</h1>
        <p>محاضرات منظمة واختبارات ومتابعة لمستواك الدراسي.</p>
      </section>

      {msg && (
        <div className="notice" role="status">
          {msg}
        </div>
      )}

      {!session ? (
        <section className="auth grid2">
          <form className="panel" onSubmit={login}>
            <h2>تسجيل الدخول</h2>

            <label>
              البريد الإلكتروني
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              كلمة المرور
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            <button disabled={busy}>دخول</button>

            <button
              type="button"
              className="link"
              onClick={resetPassword}
            >
              نسيت كلمة المرور؟
            </button>
          </form>

          <form className="panel" onSubmit={register}>
            <h2>إنشاء حساب طالب</h2>

            <label>
              الاسم بالكامل
              <input
                required
                autoComplete="name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>

            <label>
              البريد الإلكتروني
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              رقم الهاتف
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </label>

            <label>
              الصف الدراسي
              <select
                value={grade}
                onChange={e => setGrade(e.target.value)}
              >
                {grades.map(g => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>

            <label>
              كلمة المرور (6 أحرف على الأقل)
              <input
                type="password"
                minLength="6"
                required
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            <button disabled={busy}>إنشاء الحساب</button>
          </form>
        </section>
      ) : tab === 'admin' && isAdmin ? (
        <section className="content">
          <h2>لوحة تحكم المدير</h2>

          <div className="grid2">
            <form className="panel" onSubmit={addCourse}>
              <h3>إضافة كورس</h3>

              <label>
                اسم الكورس
                <input
                  required
                  value={courseTitle}
                  onChange={e => setCourseTitle(e.target.value)}
                />
              </label>

              <label>
                الصف
                <select
                  value={courseGrade}
                  onChange={e => setCourseGrade(e.target.value)}
                >
                  {grades.map(g => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>

              <label>
                السعر بالجنيه
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </label>

              <button disabled={busy}>إضافة الكورس</button>
            </form>

            <form className="panel" onSubmit={addLesson}>
              <h3>إضافة درس</h3>

              <label>
                الكورس
                <select name="course" required>
                  {courses.map(c => (
                    <option value={c.id} key={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                عنوان الدرس
                <input name="title" required />
              </label>

              <label>
                رابط الفيديو
                <input
                  name="url"
                  type="url"
                  required
                  placeholder="رابط الفيديو"
                />
              </label>

              <label>
                ترتيب الدرس
                <input
                  name="order"
                  type="number"
                  defaultValue="0"
                />
              </label>

              <button disabled={busy || courses.length === 0}>
                حفظ الدرس
              </button>
            </form>
          </div>

          <div className="section-heading">
            <h3>طلبات الاشتراك المعلقة ({pending.length})</h3>
            <button className="outline" onClick={loadPending}>
              تحديث
            </button>
          </div>

          {pending.length === 0 && (
            <p>لا توجد طلبات معلقة حالياً.</p>
          )}

          {pending.map(s => (
            <article className="panel item" key={s.id}>
              <b>
                {s.profiles?.full_name ||
                  s.profiles?.email ||
                  'طالب'}
              </b>

              <span>
                {s.courses?.title} — {s.courses?.grade}
              </span>

              <span>
                مرجع التحويل: {s.transfer_reference || 'غير مذكور'}
              </span>

              <div className="actions">
                <button
                  className="outline"
                  onClick={() => openReceipt(s.receipt_path)}
                >
                  عرض الإيصال
                </button>

                <button
                  disabled={busy}
                  onClick={() => review(s.id, 'approved')}
                >
                  قبول وتفعيل
                </button>

                <button
                  disabled={busy}
                  className="danger"
                  onClick={() => review(s.id, 'rejected')}
                >
                  رفض
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : tab === 'dashboard' ? (
        <section className="content">
          <h2>لوحة الطالب</h2>

          <p>
            مرحباً {profile?.full_name || session.user.email}
          </p>

          <h3>اشتراكاتي</h3>

          {mySubs.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.courses?.title}</b>
              <span>{s.courses?.grade}</span>
              <span>
                الحالة: {
                  s.status === 'approved'
                    ? 'مفعّل'
                    : s.status === 'pending'
                      ? 'قيد المراجعة'
                      : 'مرفوض'
                }
              </span>
            </article>
          ))}

          <h3>طلب اشتراك جديد</h3>

          <form className="panel" onSubmit={requestSubscription}>
            <label>
              اختر الكورس
              <select
                value={selectedCourse}
                onChange={e => setSelectedCourse(e.target.value)}
                required
              >
                <option value="">اختر...</option>

                {courses
                  .filter(c => !mySubs.some(
                    s => s.course_id === c.id &&
                      s.status !== 'rejected'
                  ))
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} — {c.price} جنيه
                    </option>
                  ))}
              </select>
            </label>

            <p>
              حوّل قيمة الاشتراك إلى محفظة فودافون كاش:
              <b>
                {wallet || 'سيظهر رقم المحفظة بعد ضبط إعدادات النشر'}
              </b>
            </p>

            <label>
              رقم العملية / رقم التحويل
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </label>

            <label>
              صورة إيصال التحويل (حتى 5 ميجابايت)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setReceipt(e.target.files?.[0] || null)}
                required
              />
            </label>

            <button
              disabled={busy || !courses.some(c =>
                !mySubs.some(
                  s => s.course_id === c.id &&
                    s.status !== 'rejected'
                )
              )}
            >
              إرسال للمراجعة
            </button>
          </form>

          <h3>الكورسات المفعّلة</h3>

          {courses
            .filter(c => mySubs.some(
              s => s.course_id === c.id &&
                s.status === 'approved'
            ))
            .map(c => (
              <Course key={c.id} course={c} unlocked={true} />
            ))}
        </section>
      ) : tab === 'course' && viewingCourse ? (
        <section className="content">
          <button
            className="outline"
            onClick={() => setTab('home')}
          >
            ← العودة إلى الكورسات
          </button>

          <h2>{viewingCourse.title}</h2>

          <Course
            course={viewingCourse}
            unlocked={mySubs.some(
              s => s.course_id === viewingCourse.id &&
                s.status === 'approved'
            )}
          />

          {!mySubs.some(
            s => s.course_id === viewingCourse.id &&
              s.status === 'approved'
          ) && (
            <div className="panel">
              <h3>هذا الكورس يحتاج إلى اشتراك</h3>
              <p>
                اشترك في الكورس وأرسل إيصال التحويل،
                وبعد مراجعة الإدارة سيتم تفعيل المحاضرات.
              </p>

              <button
                onClick={() => subscribeToCourse(viewingCourse)}
              >
                الاشتراك في الكورس
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="content">
          <h2>الكورسات المتاحة</h2>

          <div className="grid3">
            {courses.map(c => (
              <article className="panel course" key={c.id}>
                {getCourseImage(c) && (
                  <img
                    src={getCourseImage(c)}
                    alt="غلاف كورس الفلسفة والمنطق"
                    onError={e => {
                      e.currentTarget.style.display = 'none';
                    }}
                    style={{
                      width: '100%',
                      height: '180px',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      marginBottom: '12px'
                    }}
                  />
                )}

                <span className="tag">{c.grade}</span>
                <h3>{c.title}</h3>
                <b>{c.price} جنيه</b>

                <p>
                  تصفح تفاصيل الكورس وتعرّف على محتواه.
                </p>

                <div className="actions">
                  <button
                    className="outline"
                    onClick={() => browseCourse(c)}
                  >
                    تصفح الكورس
                  </button>

                  <button
                    onClick={() => subscribeToCourse(c)}
                  >
                    الاشتراك في الكورس
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer>
        © منصة الفيلسوف محمود حسن — جميع الحقوق محفوظة
      </footer>
    </div>
  );
}

function Course({ course, unlocked }) {
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    if (!unlocked) {
      setLessons([]);
      setError('');
      return () => {
        active = false;
      };
    }

    supabase.from('lessons')
      .select('id,title,video_url,sort_order')
      .eq('course_id', course.id)
      .order('sort_order')
      .then(({ data, error: queryError }) => {
        if (active) {
          setLessons(data || []);
          setError(queryError?.message || '');
        }
      });

    return () => {
      active = false;
    };
  }, [course.id, unlocked]);

  return (
    <article className="panel">
      {getCourseImage(course) && (
        <img
          src={getCourseImage(course)}
          alt="غلاف كورس الفلسفة والمنطق"
          onError={e => {
            e.currentTarget.style.display = 'none';
          }}
          style={{
            width: '100%',
            maxHeight: '220px',
            objectFit: 'cover',
            borderRadius: '12px',
            marginBottom: '12px'
          }}
        />
      )}

      <h3>{course.title}</h3>

      {!unlocked ? (
        <p>المحاضرات مقفولة. اشترك في الكورس لتتمكن من مشاهدتها.</p>
      ) : (
        <>
          {error && (
            <p>تعذر تحميل الدروس: {error}</p>
          )}

          {lessons.length === 0 && !error && (
            <p>لا توجد دروس مضافة لهذا الكورس بعد.</p>
          )}

          {lessons.map(lesson => (
            <p key={lesson.id}>
              ▶ {lesson.title} —{' '}
              <a
                href={lesson.video_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                مشاهدة الدرس
              </a>
            </p>
          ))}
        </>
      )}
    </article>
  );
}
