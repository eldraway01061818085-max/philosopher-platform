
import React, { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

const grades = [
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'أولى بكالوريا',
  'تانية ثانوي أزهر وعام وبكالوريا'
];

const PHILOSOPHY_IMAGE = '/file_00000000f7a881f4b475ffb6768b5f12.png';
const VODAFONE_CASH_NUMBER = '01064018499';
const PAYMENT_WHATSAPP = '201064018499';
const SUPPORT_WHATSAPP = '201061818085';

function getCourseImage(course) {
  return /فلسفة|منطق/.test(course?.title || '')
    ? PHILOSOPHY_IMAGE
    : '';
}

function getErrorMessage(error) {
  return error?.message || 'حدث خطأ غير معروف. حاول مرة أخرى.';
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
  const [selectedCourse, setSelectedCourse] = useState('');
  const [viewedCourse, setViewedCourse] = useState(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!configured) return undefined;

    let mounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (mounted && !error) {
          setSession(data.session);
        }
      })
      .catch(error => {
        if (mounted) {
          setMsg('تعذر التحقق من تسجيل الدخول: ' + getErrorMessage(error));
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

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
      if (selectedCourse) setTab('dashboard');
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

    try {
      const userId = activeSession.user.id;

      const [
        { data: profileData, error: profileError },
        { data: subs, error: subsError }
      ] = await Promise.all([
        supabase.from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),

        supabase.from('subscriptions')
          .select('*, courses(title,grade,price)')
          .eq('student_id', userId)
          .order('created_at', { ascending: false })
      ]);

      if (profileError) {
        setMsg('تعذر تحميل الملف الشخصي: ' + profileError.message);
      } else {
        const metadata = activeSession.user.user_metadata || {};

        setProfile(profileData || {
          id: userId,
          full_name: metadata.full_name || '',
          email: activeSession.user.email || '',
          phone: metadata.phone || '',
          grade: metadata.grade || '',
          role: 'student'
        });
      }

      if (subsError) {
        setMsg('تعذر تحميل الاشتراكات: ' + subsError.message);
      } else {
        setMySubs(subs || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل بيانات الحساب: ' + getErrorMessage(error));
    }
  }

  async function loadCourses() {
    try {
      const { data, error } = await supabase.from('courses')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) {
        setMsg('تعذر تحميل الكورسات: ' + error.message);
      } else {
        setCourses(data || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الكورسات: ' + getErrorMessage(error));
    }
  }

  async function loadPending() {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.from('subscriptions')
        .select('*, profiles(full_name,email,phone), courses(title,grade,price)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        setMsg('تعذر تحميل طلبات الاشتراك: ' + error.message);
      } else {
        setPending(data || []);
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الطلبات: ' + getErrorMessage(error));
    }
  }

  async function register(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setMsg('');

    try {
      const { data, error } = await supabase.auth.signUp({
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

      if (error) {
        setMsg('تعذر إنشاء الحساب: ' + error.message);
      } else if (data.session) {
        setMsg('تم إنشاء الحساب وتسجيل الدخول بنجاح.');
      } else {
        setMsg('تم إنشاء الحساب. افحص بريدك الإلكتروني لتأكيد الحساب إذا كان تأكيد البريد مفعّلاً.');
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء إنشاء الحساب: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function login(event) {
    event.preventDefault();

    if (busy) return;

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        setMsg('تعذر تسجيل الدخول: ' + error.message);
      } else {
        setMsg('تم تسجيل الدخول بنجاح.');
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل الدخول: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMsg('اكتب البريد الإلكتروني أولاً.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: window.location.origin }
      );

      setMsg(error
        ? 'تعذر إرسال رابط الاستعادة: ' + error.message
        : 'إذا كان البريد مسجلاً، فستصلك رسالة استعادة كلمة المرور.'
      );
    } catch (error) {
      setMsg('حدث خطأ: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function browseCourse(course) {
    setViewedCourse(course);
    setTab('course');
    setMsg('');
  }

  function subscribeCourse(course) {
    setSelectedCourse(course.id);

    if (!session) {
      setTab('home');
      setMsg('سجّل الدخول أو أنشئ حسابًا أولاً، وسيتم اختيار الكورس تلقائيًا.');
      return;
    }

    setTab('dashboard');
    setMsg('تم اختيار كورس ' + course.title + '. أكمل طلب الاشتراك بالأسفل.');
  }

  async function requestSubscription(event) {
    event.preventDefault();

    if (busy) return;

    if (!session) {
      setMsg('يجب تسجيل الدخول أولاً.');
      setTab('home');
      return;
    }

    if (!selectedCourse) {
      setMsg('اختر الكورس أولاً.');
      return;
    }

    const course = courses.find(c => c.id === selectedCourse);

    if (!course) {
      setMsg('الكورس غير موجود. حدّث الصفحة وحاول مرة أخرى.');
      return;
    }

    const existingSubscription = mySubs.find(
      s => s.course_id === selectedCourse && s.status !== 'rejected'
    );

    if (existingSubscription) {
      setMsg(
        existingSubscription.status === 'approved'
          ? 'اشتراكك في هذا الكورس مفعّل بالفعل.'
          : 'لديك طلب اشتراك قيد المراجعة لهذا الكورس.'
      );
      return;
    }

    const whatsappWindow = window.open('about:blank', '_blank');

    setBusy(true);
    setMsg('جارٍ تسجيل طلب الاشتراك...');

    try {
      const { error } = await supabase.from('subscriptions').insert({
        student_id: session.user.id,
        course_id: selectedCourse,
        receipt_path: null,
        transfer_reference: null,
        status: 'pending'
      });

      if (error) {
        if (whatsappWindow) whatsappWindow.close();

        setMsg(
          error.code === '23505'
            ? 'لديك طلب اشتراك قائم أو اشتراك مفعّل لهذا الكورس.'
            : 'فشل تسجيل الطلب: ' + error.message
        );
        return;
      }

      const studentName =
        profile?.full_name ||
        name ||
        session.user.user_metadata?.full_name ||
        'طالب';

      const studentPhone =
        profile?.phone ||
        phone ||
        session.user.user_metadata?.phone ||
        'غير مسجل';

      const studentGrade =
        profile?.grade ||
        grade ||
        session.user.user_metadata?.grade ||
        'غير محدد';

      const message = [
        'مرحباً، أريد تأكيد طلب اشتراك في منصة الفيلسوف محمود حسن.',
        'اسم الطالب: ' + studentName,
        'البريد الإلكتروني: ' + (session.user.email || ''),
        'رقم الهاتف: ' + studentPhone,
        'الصف الدراسي: ' + studentGrade,
        'الكورس: ' + course.title,
        'السعر: ' + course.price + ' جنيه',
        '',
        'سأرسل صورة إثبات التحويل هنا.'
      ].join('\n');

      const whatsappUrl =
        'https://wa.me/' + PAYMENT_WHATSAPP +
        '?text=' + encodeURIComponent(message);

      setSelectedCourse('');
      setMsg('تم تسجيل الطلب. أرسل صورة التحويل في محادثة واتساب لإكمال المراجعة.');

      await loadProfile(session);

      if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        window.location.href = whatsappUrl;
      }
    } catch (error) {
      if (whatsappWindow) whatsappWindow.close();

      setMsg('حدث خطأ أثناء تسجيل الطلب: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function review(id, status) {
    if (!isAdmin || busy) return;

    if (!['approved', 'rejected'].includes(status)) {
      setMsg('حالة الطلب غير صحيحة.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('subscriptions')
        .update({
          status,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('status', 'pending');

      if (error) {
        setMsg('تعذر تحديث الطلب: ' + error.message);
      } else {
        setMsg(
          status === 'approved'
            ? 'تم قبول الطلب وتفعيل الاشتراك.'
            : 'تم رفض الطلب.'
        );
      }

      await Promise.all([loadPending(), loadCourses()]);
    } catch (error) {
      setMsg('حدث خطأ أثناء مراجعة الطلب: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addCourse(event) {
    event.preventDefault();

    if (!isAdmin || busy) return;

    const numericPrice = Number(price);

    if (!courseTitle.trim()) {
      setMsg('اكتب اسم الكورس.');
      return;
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setMsg('اكتب سعرًا صحيحًا للكورس.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('courses').insert({
        title: courseTitle.trim(),
        grade: courseGrade,
        price: numericPrice,
        active: true
      });

      if (error) {
        setMsg('تعذرت إضافة الكورس: ' + error.message);
      } else {
        setMsg('تمت إضافة الكورس بنجاح.');
        setCourseTitle('');
        setPrice('');
        await loadCourses();
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء إضافة الكورس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function addLesson(event) {
    event.preventDefault();

    if (!isAdmin || busy) return;

    const form = event.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    const videoUrl = String(fd.get('url') || '').trim();

    if (!title || !videoUrl) {
      setMsg('اكتب عنوان الدرس ورابط الفيديو.');
      return;
    }

    try {
      const parsedUrl = new URL(videoUrl);

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        setMsg('رابط الفيديو غير صحيح.');
        return;
      }
    } catch {
      setMsg('رابط الفيديو غير صحيح.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('lessons').insert({
        course_id: fd.get('course'),
        title,
        video_url: videoUrl,
        sort_order: Number(fd.get('order') || 0)
      });

      if (error) {
        setMsg('تعذرت إضافة الدرس: ' + error.message);
      } else {
        setMsg('تمت إضافة الدرس بنجاح.');
        form.reset();
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء إضافة الدرس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openSupport() {
    const message = 'مرحباً، أحتاج إلى مساعدة فنية في منصة الفيلسوف محمود حسن.';
    const url =
      'https://wa.me/' + SUPPORT_WHATSAPP +
      '?text=' + encodeURIComponent(message);

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyPaymentNumber() {
    try {
      if (!navigator.clipboard?.writeText) {
        setMsg('رقم فودافون كاش هو: ' + VODAFONE_CASH_NUMBER);
        return;
      }

      await navigator.clipboard.writeText(VODAFONE_CASH_NUMBER);
      setMsg('تم نسخ رقم فودافون كاش.');
    } catch {
      setMsg('رقم فودافون كاش هو: ' + VODAFONE_CASH_NUMBER);
    }
  }

  async function logout() {
    setBusy(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setMsg('تعذر تسجيل الخروج: ' + error.message);
      } else {
        setTab('home');
        setMsg('تم تسجيل الخروج.');
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل الخروج: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const approvedCourseIds = mySubs
    .filter(s => s.status === 'approved')
    .map(s => s.course_id);

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
          <p>لا تضع مفتاح Service Role في الواجهة.</p>
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
            <button onClick={() => setTab('dashboard')}>لوحتي</button>
          )}

          {isAdmin && (
            <button onClick={() => setTab('admin')}>الإدارة</button>
          )}

          <button className="outline" onClick={openSupport}>
            الدعم الفني
          </button>

          {session && (
            <button
              className="outline"
              disabled={busy}
              onClick={logout}
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

      {tab === 'home' && (
        <>
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

                <button disabled={busy}>
                  {busy ? 'جارٍ الدخول...' : 'دخول'}
                </button>

                <button
                  type="button"
                  className="link"
                  disabled={busy}
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
                    {grades.map(g => <option key={g}>{g}</option>)}
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

                <button disabled={busy}>
                  {busy ? 'جارٍ إنشاء الحساب...' : 'إنشاء الحساب'}
                </button>
              </form>
            </section>
          ) : (
            <section className="content">
              <h2>أهلاً بك في المنصة</h2>
              <p>اختر الكورس الذي تريد تصفحه أو الاشتراك فيه.</p>
            </section>
          )}

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

                  <div className="actions">
                    <button onClick={() => browseCourse(c)}>
                      تصفح الكورس
                    </button>

                    <button
                      className="outline"
                      onClick={() => subscribeCourse(c)}
                    >
                      اشتراك في الكورس
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {courses.length === 0 && (
              <p>لا توجد كورسات متاحة حالياً.</p>
            )}
          </section>
        </>
      )}

      {tab === 'course' && viewedCourse && (
        <section className="content">
          <button className="outline" onClick={() => setTab('home')}>
            العودة للكورسات
          </button>

          <article className="panel">
            {getCourseImage(viewedCourse) && (
              <img
                src={getCourseImage(viewedCourse)}
                alt="غلاف كورس الفلسفة والمنطق"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                }}
                style={{
                  width: '100%',
                  maxHeight: '260px',
                  objectFit: 'cover',
                  borderRadius: '12px',
                  marginBottom: '12px'
                }}
              />
            )}

            <span className="tag">{viewedCourse.grade}</span>
            <h2>{viewedCourse.title}</h2>
            <h3>{viewedCourse.price} جنيه</h3>

            {session && approvedCourseIds.includes(viewedCourse.id) ? (
              <>
                <p>اشتراكك في هذا الكورس مفعّل. يمكنك مشاهدة الدروس.</p>
                <Course course={viewedCourse} />
              </>
            ) : (
              <>
                <p>
                  محتوى الكورس متاح بعد الاشتراك ومراجعة الدفع وتفعيل
                  الاشتراك من الإدارة.
                </p>
                <button onClick={() => subscribeCourse(viewedCourse)}>
                  اشتراك في الكورس
                </button>
              </>
            )}
          </article>
        </section>
      )}

      {tab === 'dashboard' && session && (
        <section className="content">
          <h2>لوحة الطالب</h2>
          <p>مرحباً {profile?.full_name || session.user.email}</p>

          <h3>اشتراكاتي</h3>

          {mySubs.length === 0 && (
            <p>ليس لديك اشتراكات حتى الآن.</p>
          )}

          {mySubs.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.courses?.title || 'كورس'}</b>
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
                <option value="">اختر الكورس...</option>

                {courses
                  .filter(c => !mySubs.some(
                    s => s.course_id === c.id && s.status !== 'rejected'
                  ))
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title} — {c.price} جنيه
                    </option>
                  ))}
              </select>
            </label>

            <div className="panel">
              <h3>الدفع عن طريق فودافون كاش</h3>
              <p>حوّل قيمة الكورس إلى رقم فودافون كاش التالي:</p>

              <h2 dir="ltr">{VODAFONE_CASH_NUMBER}</h2>

              <button
                type="button"
                className="outline"
                onClick={copyPaymentNumber}
              >
                نسخ رقم فودافون كاش
              </button>

              <p>
                بعد التحويل اضغط على زر إرسال الطلب، وسيتم فتح واتساب
                لإرسال إثبات التحويل. لن يتم تفعيل الكورس إلا بعد مراجعة
                التحويل والتأكد من وصول المبلغ.
              </p>
            </div>

            <button disabled={busy || !selectedCourse}>
              {busy
                ? 'جارٍ إرسال الطلب...'
                : 'تسجيل الطلب وإرسال إثبات التحويل على واتساب'}
            </button>
          </form>

          <h3>الكورسات المفعّلة</h3>

          {courses
            .filter(c => approvedCourseIds.includes(c.id))
            .map(c => (
              <div key={c.id}>
                <Course course={c} />
              </div>
            ))}
        </section>
      )}

      {tab === 'admin' && isAdmin && (
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
                  {grades.map(g => <option key={g}>{g}</option>)}
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

              <button disabled={busy}>
                {busy ? 'جارٍ الحفظ...' : 'إضافة الكورس'}
              </button>
            </form>

            <form className="panel" onSubmit={addLesson}>
              <h3>إضافة درس</h3>

              <label>
                الكورس
                <select name="course" required defaultValue="">
                  <option value="" disabled>اختر الكورس...</option>
                  {courses.map(c => (
                    <option value={c.id} key={c.id}>{c.title}</option>
                  ))}
                </select>
              </label>

              <label>
                عنوان الدرس
                <input name="title" required />
              </label>

              <label>
                رابط الفيديو
                <input name="url" type="url" required placeholder="رابط الفيديو" />
              </label>

              <label>
                ترتيب الدرس
                <input name="order" type="number" defaultValue="0" />
              </label>

              <button disabled={busy || courses.length === 0}>
                {busy ? 'جارٍ الحفظ...' : 'حفظ الدرس'}
              </button>
            </form>
          </div>

          <div className="section-heading">
            <h3>طلبات الاشتراك المعلقة ({pending.length})</h3>
            <button
              className="outline"
              disabled={busy}
              onClick={loadPending}
            >
              تحديث
            </button>
          </div>

          {pending.length === 0 && (
            <p>لا توجد طلبات معلقة حالياً.</p>
          )}

          {pending.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.profiles?.full_name || s.profiles?.email || 'طالب'}</b>
              <span>{s.courses?.title} — {s.courses?.grade}</span>
              <span>المبلغ: {s.courses?.price ?? 'غير محدد'} جنيه</span>
              <span>هاتف الطالب: {s.profiles?.phone || 'غير مسجل'}</span>
              <span>البريد: {s.profiles?.email || 'غير متاح'}</span>

              <p>
                تأكد من وصول التحويل فعلياً قبل الضغط على قبول وتفعيل.
              </p>

              <div className="actions">
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
      )}

      <footer>
        <p>© منصة الفيلسوف محمود حسن — جميع الحقوق محفوظة</p>
        <button className="outline" onClick={openSupport}>
          الدعم الفني عبر واتساب: 01061818085
        </button>
      </footer>
    </div>
  );
}

function Course({ course }) {
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadLessons() {
      setLoading(true);
      setError('');

      try {
        const { data, error: queryError } = await supabase.from('lessons')
          .select('id,title,video_url,sort_order')
          .eq('course_id', course.id)
          .order('sort_order');

        if (!active) return;

        if (queryError) {
          setError(queryError.message);
          setLessons([]);
        } else {
          setLessons(data || []);
        }
      } catch (error) {
        if (active) setError(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadLessons();

    return () => {
      active = false;
    };
  }, [course.id]);

  return (
    <article className="panel">
      <h3>{course.title}</h3>

      {loading && <p>جارٍ تحميل الدروس...</p>}

      {error && <p>تعذر تحميل الدروس: {error}</p>}

      {!loading && !error && lessons.length === 0 && (
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
    </article>
  );
}
