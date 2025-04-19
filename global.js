console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const pages = [
    { url: '', title: 'Home' },
    { url: 'projects/', title: 'Projects' },
    { url: 'contact/', title: 'Contact' },
    { url: 'resume/', title: 'Resume' },
    { url: 'https://github.com/sophia-vo', title: 'GitHub' } 
  ];
  

  const REPO_NAME = 'portfolio'; 
  const BASE_PATH = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? "/" 
    : `/${REPO_NAME}/`; 
  
  const nav = document.createElement('nav');
  document.body.prepend(nav); 
  
  const ul = document.createElement('ul');
  nav.append(ul);
  
  for (const p of pages) {
    let url = p.url;
    const title = p.title;
    const isRelative = !url.startsWith('http');
  
    if (isRelative) {
      url = BASE_PATH + url;
    }
  
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = url;
    a.textContent = title;
  
    const currentPath = location.pathname.endsWith('/') ? location.pathname : location.pathname + '/';
    const linkPath = a.pathname.endsWith('/') ? a.pathname : a.pathname + '/';
    const isCurrent = (a.host === location.host && linkPath === currentPath);
    if (!isCurrent && (location.pathname === BASE_PATH || location.pathname === BASE_PATH + 'index.html') && a.pathname === BASE_PATH) {
         a.classList.add('current');
    } else if (isCurrent) {
         a.classList.add('current');
    }
  
  
    const isExternal = a.host !== location.host;
    if (isExternal) {
      a.target = '_blank'; 
    }
  
    li.append(a);
    ul.append(li);
  }
  
document.body.insertAdjacentHTML(
  'afterbegin', 
  `
  <header>
	<label class="color-scheme">
		Theme:
		<select>
			<option value="light dark">Automatic</option>
			<option value="light">Light</option>
			<option value="dark">Dark</option>
		</select>
	</label>
  </header>
`
);

const colorSchemeSelect = document.querySelector('.color-scheme select');

function setColorScheme(scheme) {
  document.documentElement.style.setProperty('color-scheme', scheme);
  if (colorSchemeSelect) {
    colorSchemeSelect.value = scheme;
  }
}

colorSchemeSelect?.addEventListener('input', (event) => {
  const newScheme = event.target.value;
  localStorage.setItem('colorScheme', newScheme); 
  setColorScheme(newScheme); 
});

const savedScheme = localStorage.getItem('colorScheme');
if (savedScheme) {
  setColorScheme(savedScheme);
}

const form = document.querySelector('form');
form?.addEventListener('submit', e => {
  e.preventDefault();              
  const data = new FormData(form);

  for (let [name, value] of data) {
    console.log(name, value);
  }

  for (let [name, value] of data) {
    console.log(name, encodeURIComponent(value));
  }

  const params = [];
  for (let [name, value] of data) {
    params.push(`${name}=${encodeURIComponent(value)}`);
  }
  const url = form.action + '?' + params.join('&');

  location.href = url;
});
