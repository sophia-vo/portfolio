import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');

const projectsContainer = document.querySelector('.projects');

const countElement = document.querySelector('.project-count');
if (countElement) {
  countElement.textContent = `(${projects.length})`; // Display count like (12)
}

renderProjects(projects, projectsContainer, 'h2');