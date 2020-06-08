const html = todos => `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Todos</title>
    </head>
    
    <body>
        <h1>Todos</h1>
        <div>
            <input type="text" name="name" placeholder="A new todo" />
            <button id="create">Create</button>
        </div>
        <div id="todos"></div>
    </body>
    
    <script>
        window.todos = ${todos};
        
        var updateTodos = function() {
            fetch("/", { method: 'PUT', body: JSON.stringify({ todos: window.todos }) });
            populateTodos();
        }
        
        var populateTodos = function() {
            var todoContainer = document.querySelector('#todos');
            todoContainer.innerHTML = null;
            window.todos.forEach(todo => {
                var el = document.createElement('div');
                el.dataset.todo = todo.id;
                var name = document.createElement('span');
                name.textContent = todo.name;
                
                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = todo.completed ? 1 : 0;
                checkbox.addEventListener('change',completeTodo);
                
                el.appendChild(checkbox);
                el.appendChild(name);
                todoContainer.appendChild(el);
            })
        };

        populateTodos();

        var createTodo = function() {
            var input = document.querySelector('input[name=name]');
            if (input.value.length) {
                window.todos = [].concat(todos, {
                    id: todos.length + 1,
                    name: input.value,
                    completed: false,
                });
                input.value = "";
                updateTodos();
            }
        };
        
        var completeTodo = function(evt) {
            var checkbox = evt.target;
            var todoElement = checkbox.parentNode;
            
            var newTodoSet = [].concat(window.todos);
            var todo = newTodoSet.find(t => t.id == todoElement.dataset.todo);
            todo.completed = !todo.completed;
            todos = newTodoSet;
            updateTodos();
        };

        document.querySelector('#create').addEventListener('click', createTodo);
    </script>
</html>
`;

const defaultData = {
    todos: [
        // {
        //     id: 1,
        //     name: 'Finish the Cloudflare Workers blog post',
        //     completed: false,
        // },
    ],
};

const setCache = (key, data) => TODOS.put(key, data);
const getCache = key => TODOS.get(key);

async function updateTodos(request) {
    const body = await request.text();
    const ip = request.headers.get('CF-Connecting-IP');
    const myKey = `data-${ip}`;
    try {
        JSON.parse(body);
        await setCache(myKey, body);
        return new Response(body, { status: 200 });
    } catch (err) {
        return new Response(err, { status: 500 });
    }
}

/**
 * Respond with hello worker text
 * @param {Request} request
 */
async function getTodos(request) {
    const ip = request.headers.get('CF-Connecting-IP');
    const myKey = `data-${ip}`;

    let data;
    const cache = await getCache(myKey);
    if (!cache) {
        await setCache(myKey,JSON.stringify(defaultData));
        data = defaultData;
    } else {
        data = JSON.parse(cache);
    }

    const body = html(JSON.stringify(data.todos || []));
    return new Response(body, {
        headers: { 'Content-Type': 'text/html' },
    });
}

import { authorize, handleRedirect } from './auth0';

async function handleRequest(request) {
    if (request.method === 'PUT') {
        return updateTodos(request);
    } else {
        return getTodos(request);
    }
}

addEventListener('fetch', event => {
    let request = event.request;
    let response = new Response(null);
    const url = new URL(request.url);

    try {
        if (url.pathname === '/auth') {
            const authorizedResponse = await handleRedirect(event);
            if (!authorizedResponse) {
                return new Response("Unauthorized", { status: 401 })
            }
            response = new Response(response.body, {
                response,
                ...authorizedResponse,
            });
            return response
        }

        const [authorized, { authorization, redirectUrl }] = await authorize(event);
        if (authorized && authorization.accessToken) {
            request = new Request(request, {
                headers: {
                    Authorization: `Bearer ${authorization.accessToken}`,
                },
            })
        }
        if (!authorized) {
            return Response.redirect(redirectUrl)
        }

        response = event.respondWith(handleRequest(event.request));

        return response
    } catch (e) {
        return new Response(e.message || e.toString(), { status: 500 })
    }

});

