import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const countEl = document.querySelector('.project-count');
const searchInput = document.querySelector('.searchBar');

let query = '';
let selectedIndex = -1;

function updateList(data) {
  countEl.textContent = `${data.length}`;
  renderProjects(data, projectsContainer, 'h2');
}

function getPieData(data) {
  const rolled = d3.rollups(
    data,
    v => v.length,
    d => d.year
  );
  return rolled.map(([year, count]) => ({ label: year, value: count }));
}

function renderPie(data) {
  const pieData = getPieData(data);
  const svg = d3.select('#projects-pie-plot');
  const legend = d3.select('.legend');
  const arcGen = d3.arc().innerRadius(0).outerRadius(50);
  const pieGen = d3.pie().value(d => d.value);

  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  const arcs = pieGen(pieData);
  const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

  svg.selectAll('path')
    .data(arcs)
    .join('path')
      .attr('d', arcGen)
      .attr('fill', (_, i) => colorScale(i))
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        d3.selectAll('#projects-pie-plot path').classed('selected', false);
        d3.selectAll('.legend li').classed('selected', false);

        d3.select(event.currentTarget).classed('selected', true);
        d3.select(`.legend li:nth-child(${d.index + 1})`)
          .classed('selected', true);

        selectedIndex = (selectedIndex === d.index ? -1 : d.index);
        applySelection();
        filterAndUpdate();
      });

  legend.selectAll('li')
    .data(arcs)
    .join('li')
      .attr('style', (d, i) => `--color: ${colorScale(i)}`)
      .html(d => `<span class="swatch"></span>${d.data.label} <em>(${d.data.value})</em>`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        selectedIndex = (selectedIndex === d.index ? -1 : d.index);
        applySelection();
        filterAndUpdate();
      });

  applySelection();
}

function applySelection() {
  d3.selectAll('#projects-pie-plot path')
    .attr('opacity', (_, i) => selectedIndex === -1 || selectedIndex === i ? 1 : 0.5)
    .classed('selected', (_, i) => selectedIndex === i);

  d3.selectAll('.legend li')
    .attr('opacity', (_, i) => selectedIndex === -1 || selectedIndex === i ? 1 : 0.5)
    .classed('selected', (_, i) => selectedIndex === i);
}

function filterAndUpdate() {
  const searchData = projects.filter(p =>
    Object.values(p)
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  let listData = searchData;
  if (selectedIndex !== -1) {
    const pieData = getPieData(searchData);
    const year    = pieData[selectedIndex].label;
    listData = searchData.filter(p => p.year === year);
  }

  const noEl   = document.querySelector('.no-results');
  const chartC = document.querySelector('.chart-container');
  if (listData.length === 0) {
    noEl.hidden = false;
    chartC.classList.add('hidden');
  } else {
    noEl.hidden = true;
    chartC.classList.remove('hidden');
  }

  updateList(listData);
  renderPie(searchData);
}

// wire up search bar
searchInput.addEventListener('input', e => {
  query = e.target.value;
  filterAndUpdate();
});

// initial render
updateList(projects);
renderPie(projects);
