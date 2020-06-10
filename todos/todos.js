const html = (todos, jsonState) => `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Todos</title>
    </head>
    
    <body>
        <h1><span class="nickname"></span> Todos</h1>
        <a href="/logout">Log out</a>
        <div>
            <input type="text" name="name" placeholder="A new todo" />
            <button id="create">Create</button>
        </div>
        <div id="todos"></div>
    </body>
    
    <script>
        const edge_state = ${jsonState};
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
        document.querySelector('.nickname').textContent = edge_state.nickname+"'s";
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

async function updateTodos(request, authorization) {
    const body = await request.text();
    // const ip = request.headers.get('CF-Connecting-IP');
    const myKey = `data-${authorization.userInfo.sub}`;
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
async function getTodos(request, authorization) {
    // const ip = request.headers.get('CF-Connecting-IP');
    const myKey = `data-${authorization.userInfo.sub}`;

    let data;
    const cache = await getCache(myKey);
    if (!cache) {
        await setCache(myKey,JSON.stringify(defaultData));
        data = defaultData;
    } else {
        data = JSON.parse(cache);
    }

    const jsonState = JSON.stringify(authorization.userInfo);
    const body = html(JSON.stringify(data.todos || []), jsonState);
    return new Response(body, {
        headers: { 'Content-Type': 'text/html' },
    });
}

import { authorize, handleRedirect, logout } from './auth0';

async function handleRequest(event) {
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

        if (url.pathname === "/logout") {
            const { headers } = logout(event);
            return headers
                ? new Response(response.body, {
                    ...response,
                    headers: Object.assign({}, response.headers, headers)
                })
                : Response.redirect(url.origin);
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

        if (request.method === 'PUT') {
            response = updateTodos(request, authorization);
        } else {
            response = getTodos(request, authorization);
        }

        return response;
    } catch (e) {
        return new Response(e.message || e.toString(), { status: 500 })
    }
}

addEventListener('fetch', event => {
    // let request = event.request;
    return event.respondWith(handleRequest(event));
    // let response = new Response(null);
    // const url = new URL(request.url);
    //
    // try {
    //     if (url.pathname === '/auth') {
    //         const authorizedResponse = await handleRedirect(event);
    //         if (!authorizedResponse) {
    //             return new Response("Unauthorized", { status: 401 })
    //         }
    //         response = new Response(response.body, {
    //             response,
    //             ...authorizedResponse,
    //         });
    //         return response
    //     }
    //
    //     if (url.pathname === "/logout") {
    //         const { headers } = logout(event);
    //         return headers
    //             ? new Response(response.body, {
    //                 ...response,
    //                 headers: Object.assign({}, response.headers, headers)
    //             })
    //             : Response.redirect(url.origin);
    //     }
    //
    //     const [authorized, { authorization, redirectUrl }] = await authorize(event);
    //     if (authorized && authorization.accessToken) {
    //         request = new Request(request, {
    //             headers: {
    //                 Authorization: `Bearer ${authorization.accessToken}`,
    //             },
    //         })
    //     }
    //     if (!authorized) {
    //         return Response.redirect(redirectUrl)
    //     }
    //
    //     response = event.respondWith(handleRequest(event.request, authorization));
    //
    //     return response
    // } catch (e) {
    //     return new Response(e.message || e.toString(), { status: 500 })
    // }

});

