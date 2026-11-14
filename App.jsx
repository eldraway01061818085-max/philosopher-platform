
import React, { useEffect, useState } from 'react';
import { supabase, configured } from './supabase';

const grades = [
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
  'أولى بكالوريا',
  'تانية ثانوي أزهر وعام وبكالوريا'
];

const governorates = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'البحيرة',
  'مطروح', 'كفر الشيخ', 'الغربية', 'المنوفية', 'الدقهلية',
  'دمياط', 'الشرقية', 'بورسعيد', 'الإسماعيلية', 'السويس',
  'شمال سيناء', 'جنوب سيناء', 'الفيوم', 'بني سويف', 'المنيا',
  'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان',
  'البحر الأحمر', 'الوادي الجديد'
];

const PHILOSOPHY_IMAGE = '/file_00000000f7a881f4b475ffb6768b5f12.png';
const PSYCHOLOGY_IMAGE = '/file_00000000e300820a824803dc05058f7d.png';
const TEACHER_IMAGE = '/IMG-20261103-WA0020.jpg';

const VODAFONE_CASH_NUMBER = '01064018499';
const PAYMENT_WHATSAPP = '201064018499';
const SUPPORT_WHATSAPP = '201061818085';

function getCourseImage(course) {
  const title = (course?.title || '').trim();
  if (/فلسفة|منطق/.test(title)) return PHILOSOPHY_IMAGE;
  if (/علم\s*نفس/.test(title)) return PSYCHOLOGY_IMAGE;
  return '';
}

function getErrorMessage(error) {
  return error?.message || 'حدث خطأ غير معروف. حاول مرة أخرى.';
}

function normalizeQuizList(data) {
  let value = data;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.quizzes)) return value.quizzes;
  if (Array.isArray(value?.data)) return value.data;
  if (value && value.id) return [value];

  return [];
}

function normalizeLessons(data) {
  let value = data;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.lessons)) return value.lessons;
  if (Array.isArray(value?.data)) return value.data;

  return [];
}

function createEmptyQuestion() {
  return {
    question_text: '',
    options: ['', '', '', ''],
    correct_option: 0,
    sort_order: 0
  };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tab, setTab] = useState('home');
  const [courses, setCourses] = useState([]);
  const [mySubs, setMySubs] = useState([]);
  const [pending, setPending] = useState([]);
  const [progressRows, setProgressRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState('register');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(grades[0]);
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [governorate, setGovernorate] = useState('');

  const [courseTitle, setCourseTitle] = useState('');
  const [courseGrade, setCourseGrade] = useState(grades[0]);
  const [price, setPrice] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [viewedCourse, setViewedCourse] = useState(null);

  // حالات إدارة الاختبارات
  const [adminQuizCourse, setAdminQuizCourse] = useState('');
  const [adminQuizLessons, setAdminQuizLessons] = useState([]);
  const [adminQuizzes, setAdminQuizzes] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSaving, setQuizSaving] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState(null);
  const [quizLessonId, setQuizLessonId] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizAttemptsLimit, setQuizAttemptsLimit] = useState('1');
  const [quizPassingScore, setQuizPassingScore] = useState('50');
  const [quizIsActive, setQuizIsActive] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([createEmptyQuestion()]);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!configured) return undefined;

    let mounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (mounted && !error) setSession(data.session);
      })
      .catch(error => {
        if (mounted) setMsg('تعذر التحقق من تسجيل الدخول: ' + getErrorMessage(error));
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
      setProgressRows([]);
    }
  }, [session]);

  useEffect(() => {
    if (isAdmin) loadPending();
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && tab === 'admin' && adminQuizCourse) {
      loadAdminQuizLessons(adminQuizCourse);
      loadAdminQuizzes(adminQuizCourse);
    }
  }, [isAdmin, tab, adminQuizCourse]);

  async function loadProfile(activeSession = session) {
    if (!activeSession) return;

    try {
      const userId = activeSession.user.id;
      const metadata = activeSession.user.user_metadata || {};
      const metadataUpdates = {};

      if (metadata.full_name) metadataUpdates.full_name = metadata.full_name;
      if (metadata.phone) metadataUpdates.phone = metadata.phone;
      if (metadata.guardian_phone) metadataUpdates.guardian_phone = metadata.guardian_phone;
      if (metadata.governorate) metadataUpdates.governorate = metadata.governorate;
      if (metadata.grade) metadataUpdates.grade = metadata.grade;

      if (Object.keys(metadataUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update(metadataUpdates)
          .eq('id', userId);

        if (updateError) {
          console.warn('تعذرت مزامنة بيانات الملف الشخصي:', updateError.message);
        }
      }

      const [
        { data: profileData, error: profileError },
        { data: subs, error: subsError },
        { data: progress, error: progressError }
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('subscriptions')
          .select('*, courses(title,grade,price)')
          .eq('student_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('course_progress')
          .select('id,student_id,course_id,lesson_id,completed_at')
          .eq('student_id', userId)
      ]);

      if (profileError) {
        setMsg('تعذر تحميل الملف الشخصي: ' + profileError.message);
      } else {
        setProfile(profileData || {
          id: userId,
          full_name: metadata.full_name || '',
          email: activeSession.user.email || '',
          phone: metadata.phone || '',
          guardian_phone: metadata.guardian_phone || '',
          governorate: metadata.governorate || '',
          grade: metadata.grade || '',
          role: 'student'
        });
      }

      if (subsError) setMsg('تعذر تحميل الاشتراكات: ' + subsError.message);
      else setMySubs(subs || []);

      if (progressError) {
        setProgressRows([]);
        setMsg('تعذر تحميل تقدم الدروس: ' + progressError.message);
      } else {
        setProgressRows(progress || []);
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

      if (error) setMsg('تعذر تحميل الكورسات: ' + error.message);
      else setCourses(data || []);
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الكورسات: ' + getErrorMessage(error));
    }
  }

  async function loadPending() {
    if (!isAdmin) return;

    try {
      const { data, error } = await supabase.from('subscriptions')
        .select('*, profiles(full_name,email,phone,guardian_phone,governorate), courses(title,grade,price)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) setMsg('تعذر تحميل طلبات الاشتراك: ' + error.message);
      else setPending(data || []);
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الطلبات: ' + getErrorMessage(error));
    }
  }

  // تحميل دروس الكورس المختار للأدمن باستخدام RPC الآمنة
  async function loadAdminQuizLessons(courseId) {
    if (!isAdmin || !courseId) {
      setAdminQuizLessons([]);
      return;
    }

    try {
      const { data, error } = await supabase.rpc(
        'get_course_lessons_secure',
        { p_course_id: courseId }
      );

      if (error) {
        setMsg('تعذر تحميل دروس الكورس لإدارة الاختبارات: ' + error.message);
        setAdminQuizLessons([]);
        return;
      }

      const rows = normalizeLessons(data);
      setAdminQuizLessons(rows.map(row => ({
        ...row,
        id: row.lesson_id || row.id
      })).filter(row => row.id));
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الدروس: ' + getErrorMessage(error));
      setAdminQuizLessons([]);
    }
  }

  // تحميل اختبارات الكورس من دالة الإدارة
  async function loadAdminQuizzes(courseId = adminQuizCourse) {
    if (!isAdmin) return;

    setQuizLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        'admin_list_quizzes',
        { p_course_id: courseId || null }
      );

      if (error) {
        setMsg('تعذر تحميل الاختبارات: ' + error.message);
        setAdminQuizzes([]);
      } else {
        setAdminQuizzes(normalizeQuizList(data));
      }
    } catch (error) {
      setMsg('حدث خطأ أثناء تحميل الاختبارات: ' + getErrorMessage(error));
      setAdminQuizzes([]);
    } finally {
      setQuizLoading(false);
    }
  }

  function resetQuizForm() {
    setEditingQuizId(null);
    setQuizLessonId('');
    setQuizTitle('');
    setQuizAttemptsLimit('1');
    setQuizPassingScore('50');
    setQuizIsActive(false);
    setQuizQuestions([createEmptyQuestion()]);
  }

  function editQuiz(quiz) {
    const questions = Array.isArray(quiz.questions)
      ? [...quiz.questions]
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((question, index) => ({
            question_text: question.question_text || '',
            options: Array.isArray(question.options)
              ? question.options.map(option =>
                  typeof option === 'string'
                    ? option
                    : option?.text || String(option ?? '')
                )
              : ['', '', '', ''],
            correct_option: Number(question.correct_option ?? 0),
            sort_order: Number(question.sort_order ?? index)
          }))
      : [];

    setEditingQuizId(quiz.id);
    setQuizLessonId(quiz.lesson_id || '');
    setQuizTitle(quiz.title || '');
    setQuizAttemptsLimit(String(quiz.attempts_limit ?? 1));
    setQuizPassingScore(String(quiz.passing_score ?? 50));
    setQuizIsActive(Boolean(quiz.is_active));
    setQuizQuestions(questions.length ? questions : [createEmptyQuestion()]);

    document.getElementById('admin-quiz-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function updateQuizQuestion(index, field, value) {
    setQuizQuestions(previous => previous.map((question, i) =>
      i === index ? { ...question, [field]: value } : question
    ));
  }

  function updateQuizOption(questionIndex, optionIndex, value) {
    setQuizQuestions(previous => previous.map((question, i) => {
      if (i !== questionIndex) return question;

      const options = [...question.options];
      options[optionIndex] = value;

      return { ...question, options };
    }));
  }

  function addQuizQuestion() {
    setQuizQuestions(previous => [
      ...previous,
      {
        ...createEmptyQuestion(),
        sort_order: previous.length
      }
    ]);
  }

  function removeQuizQuestion(index) {
    setQuizQuestions(previous => {
      if (previous.length <= 1) {
        setMsg('يجب أن يحتوي الاختبار على سؤال واحد على الأقل.');
        return previous;
      }

      return previous
        .filter((_, i) => i !== index)
        .map((question, i) => ({ ...question, sort_order: i }));
    });
  }

  async function saveAdminQuiz(event) {
    event.preventDefault();

    if (!isAdmin || quizSaving || busy) return;

    if (!adminQuizCourse) {
      setMsg('اختر الكورس أولاً.');
      return;
    }

    if (!quizLessonId) {
      setMsg('اختر الدرس الذي تريد ربط الاختبار به.');
      return;
    }

    if (!quizTitle.trim()) {
      setMsg('اكتب اسم الاختبار.');
      return;
    }

    const attempts = Number(quizAttemptsLimit);
    const passing = Number(quizPassingScore);

    if (!Number.isInteger(attempts) || attempts < 1) {
      setMsg('عدد المحاولات يجب أن يكون رقمًا صحيحًا لا يقل عن 1.');
      return;
    }

    if (!Number.isFinite(passing) || passing < 0 || passing > 100) {
      setMsg('درجة النجاح يجب أن تكون من 0 إلى 100.');
      return;
    }

    const cleanedQuestions = quizQuestions.map((question, index) => ({
      question_text: String(question.question_text || '').trim(),
      options: (question.options || []).map(option => String(option || '').trim()),
      correct_option: Number(question.correct_option),
      sort_order: index
    }));

    for (let i = 0; i < cleanedQuestions.length; i++) {
      const question = cleanedQuestions[i];

      if (!question.question_text) {
        setMsg(`اكتب نص السؤال رقم ${i + 1}.`);
        return;
      }

      if (question.options.length < 2 || question.options.some(option => !option)) {
        setMsg(`أكمل جميع اختيارات السؤال رقم ${i + 1}.`);
        return;
      }

      if (
        !Number.isInteger(question.correct_option) ||
        question.correct_option < 0 ||
        question.correct_option >= question.options.length
      ) {
        setMsg(`حدد الإجابة الصحيحة للسؤال رقم ${i + 1}.`);
        return;
      }
    }

    setQuizSaving(true);
    setMsg('');

    try {
      const { data: savedQuizId, error: saveError } = await supabase.rpc(
        'admin_save_quiz',
        {
          p_quiz_id: editingQuizId || null,
          p_lesson_id: quizLessonId,
          p_title: quizTitle.trim(),
          p_attempts_limit: attempts,
          p_passing_score: passing,
          p_is_active: quizIsActive
        }
      );

      if (saveError) {
        setMsg('تعذر حفظ بيانات الاختبار: ' + saveError.message);
        return;
      }

      const finalQuizId = savedQuizId || editingQuizId;

      if (!finalQuizId) {
        setMsg('تم حفظ بيانات الاختبار لكن لم يتم استلام معرّف الاختبار. لم يتم حفظ الأسئلة.');
        return;
      }

      const { error: questionsError } = await supabase.rpc(
        'admin_save_quiz_questions',
        {
          p_quiz_id: finalQuizId,
          p_questions: cleanedQuestions
        }
      );

      if (questionsError) {
        setMsg(
          'تم حفظ بيانات الاختبار، لكن تعذر حفظ الأسئلة: ' +
          questionsError.message +
          '. الاختبار محفوظ وقد يحتاج إلى استكمال أسئلته.'
        );
        await loadAdminQuizzes(adminQuizCourse);
        return;
      }

      setMsg(editingQuizId
        ? 'تم تحديث الاختبار وأسئلته بنجاح.'
        : 'تم إنشاء الاختبار وحفظ أسئلته بنجاح.'
      );

      resetQuizForm();
      await loadAdminQuizzes(adminQuizCourse);
    } catch (error) {
      setMsg('حدث خطأ أثناء حفظ الاختبار: ' + getErrorMessage(error));
    } finally {
      setQuizSaving(false);
    }
  }

  async function markLessonViewed(courseId, lessonId) {
    if (!session?.user?.id) {
      setMsg('سجّل الدخول أولاً.');
      return;
    }

    const hasApprovedSubscription = mySubs.some(
      s => s.course_id === courseId && s.status === 'approved'
    );

    if (!hasApprovedSubscription && !isAdmin) {
      setMsg('هذا الدرس متاح للطلاب المشتركين في الكورس فقط.');
      return;
    }

    const alreadyDone = progressRows.some(
      row => row.lesson_id === lessonId && row.course_id === courseId
    );

    if (alreadyDone) {
      setMsg('تم تسجيل مشاهدة هذا الدرس من قبل.');
      return;
    }

    setBusy(true);
    setMsg('');

    try {
      const { error } = await supabase.from('course_progress').insert({
        student_id: session.user.id,
        course_id: courseId,
        lesson_id: lessonId
      });

      if (error && error.code !== '23505') {
        setMsg('تعذر تسجيل مشاهدة الدرس: ' + error.message);
        return;
      }

      setProgressRows(prev => {
        if (prev.some(row => row.lesson_id === lessonId)) return prev;
        return [...prev, {
          student_id: session.user.id,
          course_id: courseId,
          lesson_id: lessonId
        }];
      });

      setMsg('تم تسجيل الدرس كمكتمل بنجاح.');
    } catch (error) {
      setMsg('حدث خطأ أثناء تسجيل مشاهدة الدرس: ' + getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function register(event) {
    event.preventDefault();

    if (busy) return;

    if (!phone.trim() || !guardianPhone.trim() || !governorate) {
      setMsg('من فضلك أدخل رقم هاتف الطالب ورقم ولي الأمر واختر المحافظة.');
      return;
    }

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
            phone: phone.trim(),
            guardian_phone: guardianPhone.trim(),
            governorate
          }
        }
      });

      if (error) {
        const errorText = [
          error.message || '',
          error.code || '',
          error.details || '',
          error.hint || ''
        ].join(' ').toLowerCase();

        if (
          error.code === '23505' ||
          errorText.includes('profiles_phone_unique') ||
          errorText.includes('duplicate key') ||
          errorText.includes('unique constraint')
        ) {
          setMsg('رقم التليفون ده مستخدم بالفعل في حساب آخر. استخدم رقمًا مختلفًا.');
        } else {
          setMsg('تعذر إنشاء الحساب: ' + error.message);
        }
      } else if (data.session) {
        setMsg('تم إنشاء الحساب وتسجيل الدخول بنجاح.');
      } else {
        setMsg('تم إنشاء الحساب. افحص بريدك الإلكتروني لتأكيد الحساب إذا كان تأكيد البريد مفعّلاً.');
      }
    } catch (error) {
      const errorText = [
        error?.message || '',
        error?.code || '',
        error?.details || '',
        error?.hint || ''
      ].join(' ').toLowerCase();

      if (
        error?.code === '23505' ||
        errorText.includes('profiles_phone_unique') ||
        errorText.includes('duplicate key') ||
        errorText.includes('unique constraint')
      ) {
        setMsg('رقم التليفون ده مستخدم بالفعل في حساب آخر. استخدم رقمًا مختلفًا.');
      } else {
        setMsg('حدث خطأ أثناء إنشاء الحساب: ' + getErrorMessage(error));
      }
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

      if (error) setMsg('تعذر تسجيل الدخول: ' + error.message);
      else setMsg('تم تسجيل الدخول بنجاح.');
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
    if (!session) {
      setSelectedCourse(course.id);
      setTab('home');
      setMsg('سجّل الدخول أو أنشئ حسابًا أولاً، وسيتم اختيار الكورس تلقائيًا.');
      return;
    }

    const existingSubscription = mySubs.find(
      s => s.course_id === course.id && s.status !== 'rejected'
    );

    if (existingSubscription?.status === 'approved') {
      browseCourse(course);
      return;
    }

    if (existingSubscription?.status === 'pending') {
      setMsg('طلب اشتراكك في هذا الكورس قيد المراجعة.');
      return;
    }

    setSelectedCourse(course.id);
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

      const parentPhone =
        profile?.guardian_phone ||
        session.user.user_metadata?.guardian_phone ||
        'غير مسجل';

      const studentGovernorate =
        profile?.governorate ||
        session.user.user_metadata?.governorate ||
        'غير محددة';

      const studentGrade =
        profile?.grade ||
        grade ||
        session.user.user_metadata?.grade ||
        'غير محدد';

      const message = [
        'مرحباً، أريد تأكيد طلب اشتراك في منصة الفيلسوف محمود حسن.',
        'اسم الطالب: ' + studentName,
        'البريد الإلكتروني: ' + (session.user.email || ''),
        'رقم هاتف الطالب: ' + studentPhone,
        'رقم ولي الأمر: ' + parentPhone,
        'المحافظة: ' + studentGovernorate,
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

      if (whatsappWindow) whatsappWindow.location.href = whatsappUrl;
      else window.location.href = whatsappUrl;
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

      if (error) setMsg('تعذر تحديث الطلب: ' + error.message);
      else {
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

      if (error) setMsg('تعذرت إضافة الكورس: ' + error.message);
      else {
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

      if (error) setMsg('تعذرت إضافة الدرس: ' + error.message);
      else {
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

      if (error) setMsg('تعذر تسجيل الخروج: ' + error.message);
      else {
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
    <div className="app theme-six">
      <style>{`
        .app.theme-six {
          --bg: #06131f; --bg2: #0a2030; --panel: rgba(8, 29, 43, .94);
          --panel2: #0d2b3e; --cyan: #00e5ff; --cyan2: #00b9e8;
          --text: #effaff; --muted: #a9c8d5; --line: rgba(0, 220, 255, .35);
          min-height: 100vh; color: var(--text); direction: rtl;
          background: radial-gradient(ellipse at 50% 0%, #103c56 0%, #071a29 42%, #030b13 100%);
          padding-bottom: 36px; color-scheme: dark;
        }
        .app.theme-six * { box-sizing: border-box; }
        .app.theme-six header { background: rgba(3, 14, 24, .94); border-bottom: 1px solid var(--line);
          box-shadow: 0 8px 30px rgba(0, 213, 255, .12); color: var(--text); }
        .app.theme-six header small, .app.theme-six .eyebrow { color: var(--cyan); }
        .app.theme-six .mark { background: linear-gradient(145deg, #00e5ff, #006b9d); color: #00131d;
          box-shadow: 0 0 22px rgba(0, 229, 255, .5); }
        .app.theme-six .hero { position: relative; overflow: hidden; margin: 24px auto; max-width: 1100px;
          border: 1px solid var(--line); border-radius: 26px; padding: 34px 22px;
          background: radial-gradient(ellipse at 50% 110%, rgba(0, 224, 255, .24), transparent 58%),
            linear-gradient(145deg, #0d3046, #061522 70%);
          box-shadow: 0 0 34px rgba(0, 199, 255, .14), inset 0 0 35px rgba(0, 213, 255, .05); }
        .app.theme-six .hero h1 { color: #f4fcff; text-shadow: 0 0 18px rgba(0, 221, 255, .25); }
        .app.theme-six .hero p { color: var(--muted); }
        .app.theme-six .panel, .app.theme-six .item, .app.theme-six .course {
          color: var(--text); background: linear-gradient(155deg, rgba(13, 43, 62, .98), rgba(5, 20, 31, .98));
          border: 1px solid var(--line); border-radius: 20px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, .28), 0 0 18px rgba(0, 205, 255, .08); }
        .app.theme-six h1, .app.theme-six h2, .app.theme-six h3, .app.theme-six h4 { color: #f2fbff; }
        .app.theme-six p, .app.theme-six label, .app.theme-six small { color: var(--muted); }
        .app.theme-six input, .app.theme-six select, .app.theme-six textarea {
          color: #f4fcff; background: #061b29; border: 1px solid rgba(0, 220, 255, .38);
          border-radius: 12px; outline: none; }
        .app.theme-six input:focus, .app.theme-six select:focus, .app.theme-six textarea:focus {
          border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(0, 229, 255, .13); }
        .app.theme-six input::placeholder, .app.theme-six textarea::placeholder { color: #7897a6; }
        .app.theme-six button { border-radius: 13px; transition: transform .18s ease, box-shadow .18s ease; }
        .app.theme-six button:not(:disabled):hover { transform: translateY(-2px); box-shadow: 0 0 18px rgba(0, 229, 255, .24); }
        .app.theme-six button:not(.outline):not(.danger) { color: #00151f; border: 1px solid #63f3ff;
          background: linear-gradient(110deg, #00e5ff, #00a8d8); font-weight: 800; }
        .app.theme-six button.outline { color: var(--cyan); border: 1px solid var(--cyan);
          background: rgba(0, 193, 230, .07); }
        .app.theme-six button.danger { color: #fff; background: #9f2638; border: 1px solid #ff7185; }
        .app.theme-six .tag { color: #8df5ff; background: rgba(0, 210, 245, .1);
          border: 1px solid rgba(0, 220, 255, .35); border-radius: 999px; }
        .app.theme-six .notice { color: #dffcff; background: #0b3544; border: 1px solid var(--cyan);
          border-radius: 14px; box-shadow: 0 0 18px rgba(0, 229, 255, .12); }
        .app.theme-six .side-menu { color: var(--text); background: #061724; border-left: 1px solid var(--line);
          box-shadow: -12px 0 35px rgba(0, 0, 0, .4); }
        .app.theme-six .side-menu button { color: var(--text); background: #0b2a3b; border: 1px solid rgba(0, 220, 255, .22); }
        .app.theme-six .menu-overlay { background: rgba(0, 5, 10, .72); }
        .app.theme-six .section-heading { color: var(--text); }
        .app.theme-six a, .app.theme-six .link { color: var(--cyan); }
        .app.theme-six hr { border-color: var(--line); }
        @media (max-width: 640px) {
          .app.theme-six .hero { margin: 14px 10px; padding: 25px 14px; border-radius: 20px; }
          .app.theme-six .hero img { width: 145px !important; height: 145px !important; }
          .app.theme-six .content { padding-left: 12px; padding-right: 12px; }
        }
      `}</style>
      <header>
        <div>
          <span className="mark">ف</span>
          <div>
            <b>منصة الفيلسوف محمود حسن</b>
            <small>الفلسفة والمنطق • المنهج المصري</small>
          </div>
        </div>

        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen(true)}
          aria-label="فتح القائمة"
          aria-expanded={menuOpen}
        >
          ☰
        </button>
      </header>

      {menuOpen && (
        <div className="menu-overlay" onClick={() => setMenuOpen(false)} />
      )}

      <aside
        className={`side-menu ${menuOpen ? 'open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="side-menu-header">
          <b>القائمة الرئيسية</b>
          <button
            type="button"
            className="menu-close"
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
          >
            ×
          </button>
        </div>

        <button type="button" onClick={() => {
          setTab('home');
          setMenuOpen(false);
        }}>
          الرئيسية
        </button>

        {session && (
          <button type="button" onClick={() => {
            setTab('dashboard');
            setMenuOpen(false);
          }}>
            حسابي
          </button>
        )}

        {isAdmin && (
          <button type="button" onClick={() => {
            setTab('admin');
            setMenuOpen(false);
          }}>
            الإدارة
          </button>
        )}

        <button type="button" className="outline" onClick={() => {
          setMenuOpen(false);
          openSupport();
        }}>
          الدعم الفني
        </button>

        {session && (
          <button type="button" className="outline" disabled={busy} onClick={() => {
            setMenuOpen(false);
            logout();
          }}>
            خروج
          </button>
        )}
      </aside>

      {tab === 'home' && (
        <section className="hero">
          <img
            src={TEACHER_IMAGE}
            alt="صورة المدرّس"
            onError={e => { e.currentTarget.style.display = 'none'; }}
            style={{
              width: '180px',
              height: '180px',
              objectFit: 'cover',
              borderRadius: '50%',
              border: '4px solid #d4af37',
              display: 'block',
              margin: '0 auto 20px'
            }}
          />

          <p className="eyebrow">تعلم • تدرب • تفوق</p>
          <h1>فهم الفلسفة يبدأ من هنا</h1>
          <p>محاضرات منظمة واختبارات ومتابعة لمستواك الدراسي.</p>
        </section>
      )}

      {msg && <div className="notice" role="status">{msg}</div>}

      {tab === 'home' && (
        <>
          {!session ? (
            <section className="auth" style={{ maxWidth: 560, margin: '0 auto' }}>
              {authMode === 'login' ? (
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
                <p style={{ textAlign: 'center', marginTop: 18 }}>
                  ليس لديك حساب؟{' '}
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => { setAuthMode('register'); setMsg(''); }}
                  >
                    إنشاء حساب
                  </button>
                </p>
              </form>
              ) : (
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
                  رقم هاتف الطالب
                  <input
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="مثال: 01012345678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </label>

                <label>
                  رقم هاتف ولي الأمر
                  <input
                    type="tel"
                    required
                    placeholder="رقم هاتف ولي الأمر"
                    value={guardianPhone}
                    onChange={e => setGuardianPhone(e.target.value)}
                  />
                </label>

                <label>
                  المحافظة
                  <select
                    required
                    value={governorate}
                    onChange={e => setGovernorate(e.target.value)}
                  >
                    <option value="">اختر المحافظة...</option>
                    {governorates.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>

                <label>
                  الصف الدراسي
                  <select required value={grade} onChange={e => setGrade(e.target.value)}>
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
                  {busy ? 'جارٍ إنشاء الحساب...' : 'إنشاء حساب'}
                </button>

                <p style={{ textAlign: 'center', marginTop: 18 }}>
                  لديك حساب؟{' '}
                  <button
                    type="button"
                    className="link"
                    disabled={busy}
                    onClick={() => { setAuthMode('login'); setMsg(''); }}
                  >
                    تسجيل دخول
                  </button>
                </p>
              </form>
              )}
            </section>
          ) : (
            <section className="content">
              <h2>أهلاً بك في المنصة</h2>
              <p>اختر الكورس الذي تريد تصفحه أو الاشتراك فيه.</p>
            </section>
          )}

          {session && (profile?.role === 'student' || profile?.role === 'admin') && (
            <section className="content">
              <StudentProgressCard
                userId={session.user.id}
                approvedCourses={courses.filter(c =>
                  isAdmin || approvedCourseIds.includes(c.id)
                )}
                progressRows={progressRows}
              />
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
                      alt={`غلاف كورس ${c.title}`}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
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
                    <button onClick={() => browseCourse(c)}>تصفح الكورس</button>

                    {session && mySubs.some(s =>
                      s.course_id === c.id && s.status === 'approved'
                    ) ? (
                      <p style={{
                        color: '#16803c',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        أنت مشترك في هذا الكورس ✓
                      </p>
                    ) : session && mySubs.some(s =>
                      s.course_id === c.id && s.status === 'pending'
                    ) ? (
                      <p style={{
                        color: '#a87916',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        طلبك قيد المراجعة
                      </p>
                    ) : (
                      <button className="outline" onClick={() => subscribeCourse(c)}>
                        اشتراك في الكورس
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {courses.length === 0 && <p>لا توجد كورسات متاحة حالياً.</p>}
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
                alt={`غلاف كورس ${viewedCourse.title}`}
                onError={e => { e.currentTarget.style.display = 'none'; }}
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

            {session && (
              approvedCourseIds.includes(viewedCourse.id) || isAdmin
            ) ? (
              <>
                <p>اشتراكك في هذا الكورس مفعّل. يمكنك مشاهدة الدروس المتاحة.</p>
                <Course
                  course={viewedCourse}
                  progressRows={progressRows}
                  onMarkViewed={markLessonViewed}
                  busy={busy}
                  isAdmin={isAdmin}
                />
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
          <h2>حسابي</h2>

          <article className="panel">
            <h3>بياناتي الشخصية</h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginTop: '16px'
            }}>
              {[
                ['الاسم بالكامل', profile?.full_name || session.user.user_metadata?.full_name || 'غير مسجل'],
                ['البريد الإلكتروني', profile?.email || session.user.email || 'غير مسجل'],
                ['رقم هاتف الطالب', profile?.phone || session.user.user_metadata?.phone || 'غير مسجل'],
                ['رقم ولي الأمر', profile?.guardian_phone || session.user.user_metadata?.guardian_phone || 'غير مسجل'],
                ['المحافظة', profile?.governorate || session.user.user_metadata?.governorate || 'غير مسجلة'],
                ['الصف الدراسي', profile?.grade || session.user.user_metadata?.grade || 'غير مسجل']
              ].map(([label, value], index) => (
                <div key={label} style={{
                  background: [
                    'linear-gradient(135deg, #fffaf0, #f4ead0)',
                    'linear-gradient(135deg, #f0f7ff, #e2edfa)',
                    'linear-gradient(135deg, #effaf3, #e0f3e7)',
                    'linear-gradient(135deg, #fff3f0, #fce5df)',
                    'linear-gradient(135deg, #f5f0ff, #eae2fa)',
                    'linear-gradient(135deg, #eef8fa, #dff0f2)'
                  ][index],
                  border: '1px solid #e6d5a8',
                  borderRadius: '14px',
                  padding: '15px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                  minWidth: 0
                }}>
                  <span style={{ color: '#947326', fontSize: '13px', fontWeight: 'bold' }}>
                    {label}
                  </span>
                  <strong dir={index === 1 || index === 2 || index === 3 ? 'ltr' : undefined}
                    style={{ color: '#26334a', fontSize: '15px', overflowWrap: 'anywhere' }}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>
          </article>

          <h3>اشتراكاتي</h3>

          {mySubs.length === 0 && <p>ليس لديك اشتراكات حتى الآن.</p>}

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

              <button type="button" className="outline" onClick={copyPaymentNumber}>
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
                <Course
                  course={c}
                  progressRows={progressRows}
                  onMarkViewed={markLessonViewed}
                  busy={busy}
                  isAdmin={isAdmin}
                />
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
                <input required value={courseTitle} onChange={e => setCourseTitle(e.target.value)} />
              </label>

              <label>
                الصف
                <select value={courseGrade} onChange={e => setCourseGrade(e.target.value)}>
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
                  {courses.map(c => <option value={c.id} key={c.id}>{c.title}</option>)}
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

          {/* إدارة الاختبارات */}
          <div className="panel" id="admin-quiz-form" style={{ marginTop: '24px' }}>
            <h3>إدارة اختبارات الدروس</h3>
            <p>اختر الكورس والدرس، ثم أنشئ الاختبار وأضف أسئلته واختياراته.</p>

            <label>
              اختر الكورس
              <select
                value={adminQuizCourse}
                onChange={e => {
                  setAdminQuizCourse(e.target.value);
                  setAdminQuizLessons([]);
                  setAdminQuizzes([]);
                  resetQuizForm();
                }}
              >
                <option value="">اختر الكورس...</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </label>

            <form onSubmit={saveAdminQuiz}>
              <label>
                الدرس المرتبط بالاختبار
                <select
                  value={quizLessonId}
                  onChange={e => setQuizLessonId(e.target.value)}
                  required
                  disabled={!adminQuizCourse || adminQuizLessons.length === 0}
                >
                  <option value="">اختر الدرس...</option>
                  {adminQuizLessons.map(lesson => (
                    <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                  ))}
                </select>
              </label>

              {adminQuizCourse && adminQuizLessons.length === 0 && (
                <p>لا توجد دروس لهذا الكورس، أو لم يتم تحميلها بعد.</p>
              )}

              <label>
                اسم الاختبار
                <input
                  value={quizTitle}
                  onChange={e => setQuizTitle(e.target.value)}
                  required
                  placeholder="مثال: اختبار الدرس الأول"
                />
              </label>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px'
              }}>
                <label>
                  عدد المحاولات
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quizAttemptsLimit}
                    onChange={e => setQuizAttemptsLimit(e.target.value)}
                    required
                  />
                </label>

                <label>
                  درجة النجاح (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={quizPassingScore}
                    onChange={e => setQuizPassingScore(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                margin: '15px 0'
              }}>
                <input
                  type="checkbox"
                  checked={quizIsActive}
                  onChange={e => setQuizIsActive(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                تفعيل الاختبار ليظهر للطلاب
              </label>

              <div className="section-heading">
                <h4>أسئلة الاختبار ({quizQuestions.length})</h4>
                <button type="button" className="outline" onClick={addQuizQuestion}>
                  + إضافة سؤال
                </button>
              </div>

              {quizQuestions.map((question, questionIndex) => (
                <div
                  key={questionIndex}
                  style={{
                    border: '1px solid #e5d6ad',
                    borderRadius: '12px',
                    padding: '15px',
                    margin: '15px 0',
                    background: '#fffdf7'
                  }}
                >
                  <div className="section-heading">
                    <h4>السؤال رقم {questionIndex + 1}</h4>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeQuizQuestion(questionIndex)}
                      disabled={quizQuestions.length <= 1}
                    >
                      حذف السؤال
                    </button>
                  </div>

                  <label>
                    نص السؤال
                    <textarea
                      rows="3"
                      value={question.question_text}
                      onChange={e => updateQuizQuestion(
                        questionIndex,
                        'question_text',
                        e.target.value
                      )}
                      required
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </label>

                  <p><b>الاختيارات</b></p>

                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex}>
                      الاختيار {optionIndex + 1}
                      <input
                        value={option}
                        onChange={e => updateQuizOption(
                          questionIndex,
                          optionIndex,
                          e.target.value
                        )}
                        required
                        placeholder={`اكتب الاختيار ${optionIndex + 1}`}
                      />
                    </label>
                  ))}

                  <label>
                    الإجابة الصحيحة
                    <select
                      value={question.correct_option}
                      onChange={e => updateQuizQuestion(
                        questionIndex,
                        'correct_option',
                        Number(e.target.value)
                      )}
                    >
                      {question.options.map((_, optionIndex) => (
                        <option key={optionIndex} value={optionIndex}>
                          الاختيار {optionIndex + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}

              <div className="actions">
                <button type="submit" disabled={quizSaving || !adminQuizCourse}>
                  {quizSaving
                    ? 'جارٍ حفظ الاختبار والأسئلة...'
                    : editingQuizId
                      ? 'حفظ تعديلات الاختبار'
                      : 'إنشاء الاختبار وحفظ الأسئلة'}
                </button>

                {editingQuizId && (
                  <button
                    type="button"
                    className="outline"
                    onClick={resetQuizForm}
                    disabled={quizSaving}
                  >
                    إلغاء التعديل
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="panel" style={{ marginTop: '24px' }}>
            <div className="section-heading">
              <h3>الاختبارات المسجلة ({adminQuizzes.length})</h3>
              <button
                type="button"
                className="outline"
                disabled={quizLoading || !adminQuizCourse}
                onClick={() => loadAdminQuizzes(adminQuizCourse)}
              >
                {quizLoading ? 'جارٍ التحديث...' : 'تحديث الاختبارات'}
              </button>
            </div>

            {!adminQuizCourse && <p>اختر كورسًا لعرض اختباراته.</p>}

            {adminQuizCourse && quizLoading && <p>جارٍ تحميل الاختبارات...</p>}

            {adminQuizCourse && !quizLoading && adminQuizzes.length === 0 && (
              <p>لا توجد اختبارات مسجلة لهذا الكورس حتى الآن.</p>
            )}

            {adminQuizzes.map(quiz => (
              <article className="item" key={quiz.id} style={{
                border: '1px solid #eee',
                borderRadius: '12px',
                padding: '14px',
                margin: '12px 0'
              }}>
                <h4>{quiz.title || 'اختبار بدون اسم'}</h4>

                <p>
                  الدرس: {
                    quiz.lesson_title ||
                    quiz.lessons?.title ||
                    adminQuizLessons.find(lesson => lesson.id === quiz.lesson_id)?.title ||
                    'غير محدد'
                  }
                </p>

                <p>
                  درجة النجاح: {quiz.passing_score ?? 50}% |
                  عدد المحاولات: {quiz.attempts_limit ?? 1}
                </p>

                <p>
                  عدد الأسئلة: {Array.isArray(quiz.questions) ? quiz.questions.length : 0}
                </p>

                <p style={{
                  color: quiz.is_active ? '#16803c' : '#a87916',
                  fontWeight: 'bold'
                }}>
                  {quiz.is_active ? 'الاختبار مفعّل' : 'الاختبار غير مفعّل'}
                </p>

                <button
                  type="button"
                  className="outline"
                  onClick={() => editQuiz(quiz)}
                >
                  تعديل الاختبار والأسئلة
                </button>
              </article>
            ))}
          </div>

          <div className="section-heading">
            <h3>طلبات الاشتراك المعلقة ({pending.length})</h3>
            <button type="button" className="outline" disabled={busy} onClick={loadPending}>
              تحديث
            </button>
          </div>

          {pending.length === 0 && <p>لا توجد طلبات معلقة حالياً.</p>}

          {pending.map(s => (
            <article className="panel item" key={s.id}>
              <b>{s.profiles?.full_name || s.profiles?.email || 'طالب'}</b>
              <span>{s.courses?.title} — {s.courses?.grade}</span>
              <span>المبلغ: {s.courses?.price ?? 'غير محدد'} جنيه</span>
              <span>هاتف الطالب: {s.profiles?.phone || 'غير مسجل'}</span>
              <span>هاتف ولي الأمر: {s.profiles?.guardian_phone || 'غير مسجل'}</span>
              <span>المحافظة: {s.profiles?.governorate || 'غير محددة'}</span>
              <span>البريد: {s.profiles?.email || 'غير متاح'}</span>

              <p>تأكد من وصول التحويل فعلياً قبل الضغط على قبول وتفعيل.</p>

              <div className="actions">
                <button disabled={busy} onClick={() => review(s.id, 'approved')}>
                  قبول وتفعيل
                </button>
                <button disabled={busy} className="danger" onClick={() => review(s.id, 'rejected')}>
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

// ============================================
// لوحة إحصائيات إنجاز الطالب
// ============================================

function StudentProgressCard({
  userId,
  approvedCourses = [],
  progressRows = []
}) {
  const [stats, setStats] = useState({
    totalLessons: 0,
    completedLessons: 0,
    totalQuizzes: 0,
    completedQuizzes: 0
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const courseIdsKey = approvedCourses
    .map(course => course.id)
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    let active = true;

    async function loadStudentStats() {
      setLoading(true);
      setError('');

      try {
        const courseIds = courseIdsKey
          ? courseIdsKey.split(',')
          : [];

        if (!userId || courseIds.length === 0) {
          if (active) {
            setStats({
              totalLessons: 0,
              completedLessons: 0,
              totalQuizzes: 0,
              completedQuizzes: 0
            });
          }
          return;
        }

        // تحميل دروس جميع الكورسات المفعّلة للطالب
        const lessonResults = await Promise.all(
          courseIds.map(async courseId => {
            const { data, error: rpcError } = await supabase.rpc(
              'get_course_lessons_secure',
              { p_course_id: courseId }
            );

            if (rpcError) throw rpcError;

            return normalizeLessons(data).map(lesson => ({
              ...lesson,
              id: lesson.lesson_id || lesson.id,
              course_id: lesson.course_id || courseId
            })).filter(lesson => lesson.id);
          })
        );

        if (!active) return;

        const allLessons = lessonResults.flat();

        // حساب الدروس المكتملة من سجلات الطالب الفعلية
        const completedLessonIds = new Set(
          progressRows
            .filter(row => courseIds.includes(row.course_id))
            .map(row => row.lesson_id)
            .filter(Boolean)
        );

        const completedLessons = allLessons.filter(
          lesson => completedLessonIds.has(lesson.id)
        ).length;

        // الاختبارات المتاحة فقط للدروس المفتوحة
        const unlockedLessons = allLessons.filter(
          lesson => lesson.is_unlocked === true
        );

        const quizResults = await Promise.all(
          unlockedLessons.map(async lesson => {
            const { data, error: quizError } = await supabase.rpc(
              'get_lesson_quiz_secure',
              { p_lesson_id: lesson.id }
            );

            if (quizError) throw quizError;

            const quizzes = normalizeQuizList(data);

            return quizzes
              .filter(quiz => quiz?.id)
              .map(quiz => quiz.id);
          })
        );

        if (!active) return;

        // إزالة تكرار الاختبارات
        const availableQuizIds = [...new Set(quizResults.flat())];

        let completedQuizIds = [];

        // قراءة محاولات الطالب للاختبارات المتاحة فقط
        if (availableQuizIds.length > 0) {
          const { data: attempts, error: attemptsError } = await supabase
            .from('quiz_attempts')
            .select('quiz_id')
            .eq('student_id', userId)
            .in('quiz_id', availableQuizIds);

          if (attemptsError) throw attemptsError;

          completedQuizIds = [
            ...new Set(
              (attempts || [])
                .map(attempt => attempt.quiz_id)
                .filter(Boolean)
            )
          ];
        }

        if (!active) return;

        setStats({
          totalLessons: allLessons.length,
          completedLessons,
          totalQuizzes: availableQuizIds.length,
          completedQuizzes: completedQuizIds.length
        });
      } catch (error) {
        if (active) {
          setError(getErrorMessage(error));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStudentStats();

    return () => {
      active = false;
    };
  }, [userId, courseIdsKey, progressRows, refreshKey]);

  const remainingLessons = Math.max(
    0,
    stats.totalLessons - stats.completedLessons
  );

  const remainingQuizzes = Math.max(
    0,
    stats.totalQuizzes - stats.completedQuizzes
  );

  const totalItems = stats.totalLessons + stats.totalQuizzes;
  const completedItems = stats.completedLessons + stats.completedQuizzes;

  const percentage = totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : 0;

  return (
    <article style={{
      margin: '18px 0 24px',
      padding: '22px',
      borderRadius: '22px',
      background: 'linear-gradient(135deg, #11152f 0%, #21194b 55%, #172b50 100%)',
      color: '#fff',
      boxShadow: '0 12px 35px rgba(17, 21, 47, 0.25)',
      border: '1px solid rgba(130, 150, 255, 0.25)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <div style={{
        position: 'absolute',
        width: '190px',
        height: '190px',
        borderRadius: '50%',
        background: 'rgba(0, 210, 255, 0.08)',
        top: '-85px',
        left: '-65px',
        pointerEvents: 'none'
      }} />

      <div style={{
        position: 'absolute',
        width: '160px',
        height: '160px',
        borderRadius: '50%',
        background: 'rgba(168, 85, 247, 0.12)',
        bottom: '-90px',
        right: '-55px',
        pointerEvents: 'none'
      }} />

      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '15px',
        flexWrap: 'wrap',
        marginBottom: '22px'
      }}>
        <div>
          <div style={{
            color: '#7ee7ff',
            fontSize: '13px',
            fontWeight: 'bold',
            marginBottom: '7px'
          }}>
            إنجازك الدراسي
          </div>

          <h3 style={{
            margin: 0,
            color: '#fff',
            fontSize: '22px'
          }}>
            رحلة تفوقك
          </h3>

          <p style={{
            margin: '7px 0 0',
            color: '#c7cce8',
            fontSize: '13px'
          }}>
            تابع تقدمك في الدروس والاختبارات
          </p>
        </div>

        <div style={{
          fontSize: '38px',
          filter: 'drop-shadow(0 0 12px rgba(255, 205, 75, 0.35))'
        }}>
          🎓
        </div>
      </div>

      {loading ? (
        <div style={{
          padding: '35px 10px',
          textAlign: 'center',
          color: '#d6ddff'
        }}>
          جارٍ حساب إنجازك الدراسي...
        </div>
      ) : error ? (
        <div style={{
          padding: '15px',
          borderRadius: '12px',
          background: 'rgba(255, 80, 80, 0.12)',
          border: '1px solid rgba(255, 120, 120, 0.35)',
          color: '#ffd0d0'
        }}>
          <p style={{ marginTop: 0 }}>
            تعذر تحميل إحصائيات الإنجاز: {error}
          </p>

          <button
            type="button"
            onClick={() => setRefreshKey(value => value + 1)}
            style={{
              border: '1px solid #9ba8ff',
              background: 'transparent',
              color: '#fff',
              borderRadius: '9px',
              padding: '9px 16px',
              cursor: 'pointer'
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '5px 0 25px'
          }}>
            <div style={{
              width: '155px',
              height: '155px',
              borderRadius: '50%',
              background: `conic-gradient(#35d7ee ${percentage * 3.6}deg, rgba(255,255,255,0.12) 0deg)`,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              boxShadow: '0 0 25px rgba(53, 215, 238, 0.15)'
            }}>
              <div style={{
                width: '132px',
                height: '132px',
                borderRadius: '50%',
                background: '#191b40',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.12)'
              }}>
                <strong style={{
                  fontSize: '35px',
                  color: '#fff',
                  lineHeight: 1.2
                }}>
                  {percentage}%
                </strong>

                <span style={{
                  color: '#aeb8df',
                  fontSize: '12px',
                  marginTop: '5px'
                }}>
                  نسبة الإنجاز
                </span>
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '12px'
          }}>
            {[
              {
                title: 'الدروس المكتملة',
                value: stats.completedLessons,
                icon: '📚',
                color: '#48d6b0',
                background: 'rgba(33, 190, 145, 0.12)',
                border: 'rgba(72, 214, 176, 0.3)'
              },
              {
                title: 'الدروس المتبقية',
                value: remainingLessons,
                icon: '📖',
                color: '#70c9ff',
                background: 'rgba(65, 155, 235, 0.12)',
                border: 'rgba(112, 201, 255, 0.3)'
              },
              {
                title: 'الاختبارات المكتملة',
                value: stats.completedQuizzes,
                icon: '🏆',
                color: '#ffd36b',
                background: 'rgba(230, 175, 55, 0.12)',
                border: 'rgba(255, 211, 107, 0.3)'
              },
              {
                title: 'الاختبارات المتبقية',
                value: remainingQuizzes,
                icon: '✍️',
                color: '#c7a4ff',
                background: 'rgba(160, 110, 230, 0.12)',
                border: 'rgba(199, 164, 255, 0.3)'
              }
            ].map(item => (
              <div
                key={item.title}
                style={{
                  background: item.background,
                  border: `1px solid ${item.border}`,
                  borderRadius: '15px',
                  padding: '15px 10px',
                  minWidth: 0,
                  textAlign: 'center'
                }}
              >
                <div style={{
                  fontSize: '23px',
                  marginBottom: '7px'
                }}>
                  {item.icon}
                </div>

                <div style={{
                  color: item.color,
                  fontSize: '27px',
                  fontWeight: 'bold',
                  lineHeight: 1.2
                }}>
                  {item.value}
                </div>

                <div style={{
                  color: '#e1e5ff',
                  fontSize: '12px',
                  marginTop: '8px',
                  lineHeight: 1.5
                }}>
                  {item.title}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '17px',
            padding: '12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.06)',
            textAlign: 'center',
            color: '#d9def8',
            fontSize: '13px'
          }}>
            إجمالي الدروس والاختبارات: {totalItems}
            <span style={{ margin: '0 8px', color: '#7182b9' }}>•</span>
            ما أنجزته: {completedItems}
          </div>

          {totalItems === 0 && (
            <p style={{
              textAlign: 'center',
              color: '#c7cce8',
              fontSize: '13px',
              marginBottom: 0
            }}>
              اشترك في أحد الكورسات المفعّلة لتبدأ متابعة إنجازك.
            </p>
          )}

          <button
            type="button"
            onClick={() => setRefreshKey(value => value + 1)}
            style={{
              display: 'block',
              margin: '16px auto 0',
              padding: '9px 18px',
              border: '1px solid rgba(126, 231, 255, 0.5)',
              background: 'rgba(126, 231, 255, 0.08)',
              color: '#b8f2ff',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            تحديث الإحصائيات
          </button>
        </>
      )}
    </article>
  );
}

function Course({
  course,
  progressRows = [],
  onMarkViewed,
  busy,
  isAdmin = false
}) {
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadLessons() {
      setLoading(true);
      setError('');

      try {
        const { data, error: queryError } = await supabase.rpc(
          'get_course_lessons_secure',
          { p_course_id: course.id }
        );

        if (!active) return;

        if (queryError) {
          setError(queryError.message);
          setLessons([]);
        } else {
          const normalizedLessons = normalizeLessons(data).map(row => ({
            ...row,
            id: row.lesson_id || row.id,
            is_unlocked: Boolean(row.is_unlocked)
          }));

          setLessons(normalizedLessons);
        }
      } catch (error) {
        if (active) setError(getErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadLessons();

    return () => { active = false; };
  }, [course.id, refreshKey]);

  const completedIds = new Set(
    progressRows
      .filter(p => p.course_id === course.id)
      .map(p => p.lesson_id)
  );

  const completedCount = lessons.filter(
    lesson => completedIds.has(lesson.id)
  ).length;

  const percent = lessons.length
    ? Math.round((completedCount / lessons.length) * 100)
    : 0;

  function refreshLessons() {
    setRefreshKey(value => value + 1);
  }

  return (
    <article className="panel">
      <h3>{course.title}</h3>

      {!loading && !error && lessons.length > 0 && (
        <div style={{
          margin: '15px 0',
          padding: '15px',
          background: '#f8f8f8',
          borderRadius: '12px'
        }}>
          <b>تقدمك في الكورس: {percent}%</b>
          <p>{completedCount} من {lessons.length} دروس مكتملة</p>

          <div style={{
            height: '10px',
            background: '#e5e5e5',
            borderRadius: '20px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${percent}%`,
              background: '#d4af37',
              borderRadius: '20px',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      )}

      {loading && <p>جارٍ تحميل الدروس...</p>}

      {error && (
        <div className="notice" role="alert">
          تعذر تحميل الدروس: {error}
          <button
            type="button"
            className="outline"
            onClick={refreshLessons}
            style={{ marginRight: '10px' }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && !error && lessons.length === 0 && (
        <p>لا توجد دروس مضافة لهذا الكورس بعد.</p>
      )}

      {lessons.map((lesson, index) => {
        const completed = completedIds.has(lesson.id);
        const unlocked = isAdmin || lesson.is_unlocked;

        return (
          <div
            key={lesson.id}
            className="item"
            style={{
              padding: '12px',
              marginBottom: '12px',
              borderBottom: '1px solid #eee',
              opacity: unlocked ? 1 : 0.75
            }}
          >
            <p>{unlocked ? '▶' : '🔒'} {lesson.title}</p>

            {unlocked ? (
              <>
                {lesson.video_url ? (
                  <a href={lesson.video_url} target="_blank" rel="noopener noreferrer">
                    مشاهدة الدرس
                  </a>
                ) : (
                  <p>رابط الفيديو غير متاح حالياً.</p>
                )}

                <div style={{ marginTop: '10px' }}>
                  {completed ? (
                    <button type="button" className="outline" disabled>
                      تمت المشاهدة ✓
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onMarkViewed(course.id, lesson.id)}
                    >
                      تمت المشاهدة
                    </button>
                  )}
                </div>

                <QuizPanel lesson={lesson} onPassed={refreshLessons} />
              </>
            ) : (
              <div style={{
                marginTop: '10px',
                padding: '12px',
                background: '#f4f4f4',
                borderRadius: '10px',
                color: '#777'
              }}>
                <b>هذا الدرس مغلق حالياً</b>
                <p>أكمل اختبار الدرس السابق بنجاح لفتح هذا الدرس.</p>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="outline"
        onClick={refreshLessons}
        disabled={loading}
      >
        تحديث حالة الدروس
      </button>
    </article>
  );
}

function QuizPanel({ lesson, onPassed }) {
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadQuiz() {
      setLoading(true);
      setError('');

      try {
        const { data, error: quizError } = await supabase.rpc(
          'get_lesson_quiz_secure',
          { p_lesson_id: lesson.id }
        );

        if (!active) return;

        if (quizError) {
          setError(quizError.message);
          setQuiz(null);
        } else {
          const normalized = normalizeQuizList(data);
          setQuiz(normalized[0] || null);
        }
      } catch (error) {
        if (active) {
          setError(getErrorMessage(error));
          setQuiz(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQuiz();

    return () => { active = false; };
  }, [lesson.id]);

  async function openQuiz() {
    if (!quiz || loading || submitting) return;

    setOpened(true);
    setError('');
    setResult(null);
    setAnswers({});

    try {
      const { data, error: questionsError } = await supabase.rpc(
        'get_quiz_questions',
        { p_quiz_id: quiz.id }
      );

      if (questionsError) {
        setError(questionsError.message);
        return;
      }

      let rows = [];

      if (Array.isArray(data)) rows = data;
      else if (Array.isArray(data?.questions)) rows = data.questions;
      else if (data && data.question_text) rows = [data];

      const validQuestions = rows
        .filter(row => row && row.id && row.question_text)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      if (validQuestions.length === 0) {
        setError('لا توجد أسئلة متاحة في هذا الاختبار حالياً.');
        setQuestions([]);
        return;
      }

      setQuestions(validQuestions);
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  function chooseAnswer(questionId, optionIndex) {
    setAnswers(prev => ({ ...prev, [questionId]: optionIndex }));
  }

  async function submitQuiz(event) {
    event.preventDefault();

    if (submitting) return;

    if (questions.length === 0) {
      setError('لا توجد أسئلة لإرسالها.');
      return;
    }

    if (Object.keys(answers).length !== questions.length) {
      setError('أجب عن جميع الأسئلة أولاً.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data, error: submitError } = await supabase.rpc(
        'submit_quiz',
        {
          p_quiz_id: quiz.id,
          p_answers: answers
        }
      );

      if (submitError) {
        setError(submitError.message);
        return;
      }

      const quizResult = Array.isArray(data) ? data[0] : data;
      setResult(quizResult || null);

      if (quizResult?.passed) onPassed?.();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p>جارٍ التحقق من اختبار الدرس...</p>;

  if (error && !opened) {
    return <p style={{ color: '#b42318' }}>تعذر تحميل الاختبار: {error}</p>;
  }

  if (!quiz) return null;

  return (
    <div style={{
      marginTop: '15px',
      padding: '15px',
      border: '1px solid #e5d6ad',
      borderRadius: '12px',
      background: '#fffdf7'
    }}>
      <h4>{quiz.title || 'اختبار الدرس'}</h4>

      {!opened && (
        <button type="button" onClick={openQuiz}>بدء اختبار الدرس</button>
      )}

      {opened && error && <p style={{ color: '#b42318' }}>{error}</p>}

      {opened && questions.length > 0 && !result && (
        <form onSubmit={submitQuiz}>
          {questions.map((question, questionIndex) => {
            const options = Array.isArray(question.options) ? question.options : [];

            return (
              <div
                key={question.id}
                style={{
                  margin: '15px 0',
                  padding: '12px',
                  background: '#fff',
                  borderRadius: '10px'
                }}
              >
                <b>{questionIndex + 1}. {question.question_text}</b>

                <div style={{
                  display: 'grid',
                  gap: '8px',
                  marginTop: '10px'
                }}>
                  {options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        checked={answers[question.id] === optionIndex}
                        onChange={() => chooseAnswer(question.id, optionIndex)}
                      />
                      <span>
                        {typeof option === 'string'
                          ? option
                          : option?.text || String(option)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <button type="submit" disabled={submitting}>
            {submitting ? 'جارٍ تصحيح الاختبار...' : 'إرسال الإجابات'}
          </button>
        </form>
      )}

      {result && (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          borderRadius: '10px',
          background: result.passed ? '#eaf7ee' : '#fff0ed',
          color: result.passed ? '#176b35' : '#a12b20'
        }}>
          <h4>
            {result.passed ? 'مبروك! نجحت في الاختبار ✓' : 'لم تحقق درجة النجاح'}
          </h4>

          <p>النتيجة: {result.score} من {result.total}</p>
          <p>النسبة: {result.percentage}%</p>
          <p>المحاولة: {result.attempt_number} من {result.attempts_limit}</p>
          <p>المحاولات المتبقية: {result.attempts_remaining}</p>

          {result.passed ? (
            <p>
              {result.next_lesson_unlocked
                ? 'تم فتح الدرس التالي بنجاح. حدّث قائمة الدروس إذا لم يظهر مفتوحاً.'
                : 'تم اجتياز الاختبار بنجاح.'}
            </p>
          ) : (
            <p>يمكنك المحاولة مرة أخرى إذا كانت لديك محاولات متبقية.</p>
          )}

          <button
            type="button"
            className="outline"
            onClick={() => {
              setResult(null);
              setAnswers({});
              setQuestions([]);
              setOpened(false);
              setError('');
            }}
            disabled={result.passed || result.attempts_remaining <= 0}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  );
}
