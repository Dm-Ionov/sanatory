# Санаторий — формы марафона для GetCourse

Одно приложение, нужная форма выбирается адресом. Вставляется на GetCourse через iframe:

```html
<iframe src="ССЫЛКА" style="width:100%; height:100vh; border:none;"></iframe>
```

| Форма | Продвинутый тренинг | Для начинающих |
|---|---|---|
| Анкета старта | https://dm-ionov.github.io/sanatory/?f=start&s=pro | https://dm-ionov.github.io/sanatory/?f=start&s=new |
| Анкета финала | https://dm-ionov.github.io/sanatory/?f=final&s=pro | https://dm-ionov.github.io/sanatory/?f=final&s=new |
| Ежедневный отчёт | https://dm-ionov.github.io/sanatory/?f=daily&s=pro | https://dm-ionov.github.io/sanatory/?f=daily&s=new |
| Панель куратора | https://dm-ionov.github.io/sanatory/?f=admin | (оба потока) |

## Файлы

- `index.html` — разметка всех форм и панели куратора
- `style.css` — оформление
- `app.js` — логика (Firebase Firestore + Auth)
- `firestore.rules` — правила доступа к базе; публикуются вручную в консоли Firebase → Firestore → Rules

## Хранение

- `starts/{поток}_{sha256(email)}` и `finals/...` — анкеты; пишет участница, читает только куратор
- `daily/{поток}_{sha256(email)}` — отчёты по дням `d1…d7`; видны всем, email не хранится
- Полный день — отмечены все 4 пункта (зелёный), неполный — только обязательные (голубой)

## Куратор

Вход по паролю через Firebase Authentication, аккаунт `curator@dvij-shagai.app`
(создаётся в консоли Firebase → Authentication → Users). Пароль в коде не хранится.

После правки `style.css` или `app.js` увеличь `?v=` в `index.html`, чтобы браузеры не держали старую версию.
