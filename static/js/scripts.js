var ws = null;
var first_attempt = false;

$(document).ready(function(){

    first_attempt = true;
    connect_to_server();

    $(document).on('click', 'a', function(e){
        e.preventDefault();
    });

    $('a.register_link').on('click', function(e){
        show_signup()
    });

    //Opens login dialog
    $('a.login_link').on('click', function(e){
        show_login()
    });

    //Initiates send login data
    $('#login_form').on('submit', function(e){
        e.preventDefault();

        data = {
            username: $('#login_username').val(),
            password: $('#login_password').val()
        };

        $.ajax({
            data: data,
            url: '/login',
            method: 'POST',
            dataType: 'json',
            success: function(data){
                if (data.status == 'success') {
                    $('#login_form')[0].reset();
                    connect_to_server();
                }else
                    show_error(data.message);
            },
            error: function(error){
                error_text = error.responseText || 'Unexpected error';
                show_error(error_text);
            }
       });
    });

    //Initiates send registration data
    $('#signup_form').on('submit', function(e){
        e.preventDefault();
        username = $('#reg_username').val();
        password = $('#reg_password1').val();
        if (password != $('#reg_password2').val()){
            show_error('passwords do not match. Please check');
            return;
        }

        data = {
            username: username,
            password: password
        };

        $.ajax({
            data: data,
            url: '/signup',
            method: 'POST',
            dataType: 'json',
            success: function(data){

                if (data.status == 'success') {
                    $('#signup_form')[0].reset();
                    connect_to_server();
                }else
                    show_error(data.message);
            },
            error: function(error){
                error_text = error.responseText || 'Unexpected error';
                show_error(error_text);
            }
       });
    });

    $('.dropdown-menu').find('form').click(function (e) {
        e.stopPropagation();
    });

    $('form.create_room').on('submit', function(e){
        e.preventDefault();
        create_room();
    });

    $('#find_room_name').on('keyup', function(e){
        filter_rooms();
    });

    $('#join_room').on('click', function(){
        join_room();
    });

    $('#signout').on('click', function(){
        signout();
    });

    $('#leave_room').on('click', function(){
        leave_room();
    });

    $('.send_message').submit('click', function(e){
        e.preventDefault();
        text = $('#newmessage').val();
        if (text == '') return;

        room = $('.room.active');
        if (room.length > 0) {
            if (!room.hasClass('joined')) {
                show_error('Selected room is not joined');
                return;
            }
        }else{
                show_error('There is no room selected');
            }
        data = {
            text: text,
            room: room.data('roomCode')
        };
        ws.send(JSON.stringify(data));
        if (ws.bufferedAmount == 0){
            $('#newmessage').val('')
        }else{
            show_error('Something wrong');
        }
    });

    $(document).on('click', '.room a', function(e){
        e.preventDefault();
        $('.active').removeClass('active');
        li_el = $(this).parent();
        li_el.addClass('active');

        $('.badge', li_el).remove();
        if (li_el.hasClass('joined')) {
            room = li_el.data('roomCode');
            show_room(room);
        }else{
            $('.messages').addClass('invisible');
        }
    });

    $(document).on('load', '.message img', function(){
        current_window = $(this).parent().parent();
        if (current_window.length > 0)
            current_window.scrollTop(current_window[0].scrollHeight);
    });
});

function ping(){
  if (ws){
    ws.send('/ping');
    setTimeout(ping, 50000);
  }
}

function show_login(){
    $('.window').hide();
    $('#login').fadeIn().removeClass('invisible');
}

function show_signup(){
    $('.window').hide();
    $('#signup').fadeIn().removeClass('invisible');
}

function show_chat(){
    $('.window').hide();
    $('#chat').fadeIn().removeClass('invisible');
}

function reload_rooms(){
    if (ws)
        ws.send('/rooms');
}

function onmessage(event){
    data = JSON.parse(event.data);
    if ('server_event' in data){
        if (data.server_event == 'room_created'){
            $('.btn-group').removeClass('open');
            reload_rooms();
            return;
        }
        if (data.server_event == 'room_joined'){
            reload_rooms();
            return;
        }
        if (data.server_event == 'rooms_list'){
            update_rooms_list(data.list);
            return;
        }
        if (data.server_event == 'room_left'){
            $('.messages.'+data.room).html('');
            reload_rooms();
            return;
        }

        if (data.server_event == 'screenshot_completed'){
            $('img#'+data.id).attr('src', data.src).removeClass('loading');

            reload_rooms();
            return;
        }

    }

    if ('status' in data) {
        if (data.status == 'error'){
            show_error(data.message);
            return;
        }
        return;
    }

    if ('text' in data){
        data.time = new Date(data.time*1000);
        html = '<p class="message"><span class="username">' + data.username +
         '</span><span class="time">' + data.time.toTimeString().substring(0,8) +
         '</span><span class="text">' + data.text + '</span>';
        if ('urls' in data) {
            for (i = 0; i < data.urls.length; i++) {
                url = data.urls[i];
                if (url.ready) {
                    html = html + '<img id="'+url.id+'" src="' + url.src + '">';
                }else{
                    html = html + '<img class="loading" id="'+url.id+'" src="/static/images/loading.gif">';
                }
            }
            setTimeout(scroll_current_window, 500);
        }
        html = html + '</p>';
        current_window = $('.messages.'+data.room);
        if (current_window.length > 0) {
            current_window.append(html);
            current_window.scrollTop(current_window[0].scrollHeight);
            if (current_window.hasClass('invisible') && !('is_history' in data)) {
                room_link = $('.room[data-room-code="' + data.room + '"] a');
                unread_messages = $('.badge', room_link);
                if (unread_messages.length > 0) {
                    i = parseInt(unread_messages.html());
                    unread_messages.html(++i);
                }
                else {
                    room_link.append('<span class="badge pull-right">1</span>');
                }
            }
        }
        if (!('is_history' in data) && !('self' in data))
            $('.room[data-room-code="' + data.room + '"]')
                .effect("shake", {direction: "right", distance: 3}, 350);
    }
}

function onclose(event){
    if (first_attempt)
        first_attempt = false;
    else {
        show_error(event.reason || 'Unexpected error');
    }
    ws = null;
    signout();
}

function onopen(){
    reload_rooms();
    show_chat();
    setTimeout(ping, 50000);
}

function show_room(room){
    $('.messages').addClass('invisible');
    room_messages = $('.messages.'+room);
    if ($('.room[data-room-code="'+room+'"]').hasClass('joined'))
    {
        room_messages.removeClass('invisible');
        room_messages.scrollTop(room_messages[0].scrollHeight);
    }

}

function check_room_name(room){
    return room.match(/^[a-zA-Z]+[\w\s]{0,30}$/) != null;
}

function connect_to_server(){
    url = location.hostname+(location.port ? ':'+location.port: '');
    ws = new WebSocket('ws://' + url + '/chat');
    ws.onclose = onclose;
    ws.onmessage = onmessage;
    ws.onopen = onopen;
}

function create_room(){
    room = $('#room_name').val();
    if (check_room_name(room)) {
        ws.send('/create ' + room);
        $('#room_name').val('');
    }
    else
        show_error('Room name is wrong');
}

function join_room() {
    room_code = $('.room.active').data('roomCode');
    if (room_code == undefined){
        show_error('There is no room seleted');
        return;
    }
    room_el = $('.room.active');
    if (room_el.hasClass('joined')) {
        show_room(room_code);
        return;
    }
    $('.messages.'+room_code).html('');
    command = '/join ' + room_code;
    ws.send(command);
}

function leave_room(){
    room = $('.room.active');
    room_code = room.data('roomCode');
    if (room.hasClass('joined')) {
        command = '/leave ' + room_code;
        ws.send(command);
    }
}

function update_rooms_list(rooms){

    $('.messages').addClass('invisible');

    active_room = $('.room.active').data('roomCode');

    joined_rooms = $('.joined_rooms');
    joined_rooms.html('');
    unjoined_rooms = $('.unjoined_rooms');
    unjoined_rooms.html('');

    for (i=0; i < rooms.length; i++){
        room = rooms[i];
        if (room.joined) {
            joined_rooms.append('<li class="room" data-room-code="'+room.code+'"><a href="">'+room.name+'</a></li>');
            el = $('.room[data-room-code="' + room.code + '"]');
            el.addClass('joined');
            if ($('.messages.' + room.code).length == 0) {
                $('.messages_wrapper').append('<div class="messages ' + room.code + ' invisible"></div>');
                ws.send('/get_history ' + room.code);
            }
        }else{
            unjoined_rooms.append('<li class="room" data-room-code="'+room.code+'"><a href="">'+room.name+'</a></li>');
        }
    }
    if (!active_room) {
        active_room = $('.joined_rooms .room:first').data('roomCode');
    }
    if (!active_room) {
        active_room = $('.unjoined_rooms .room:first').data('roomCode');
    }
    $('.room[data-room-code="' + active_room + '"]').addClass('active');
    show_room(active_room);
}

function signout(){
    if (ws) {
        ws.onclose = function(){};
        ws.close();
    }
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    $('.room').remove();
    $('.messages').remove();
    show_login();
}

function filter_rooms(){
    text = $('#find_room_name').val();
    if (text) {
        $('.room').hide();
        $('.room:contains(' + text + ')').show();
    }else{
        $('.room').show();
    }
}

function close_status_line(){
    $('#status_line').fadeOut();
}

function show_error(text){
    console.log(text);
    $('#status_line').html('<div class="error">' + text + '</div>').fadeIn();
    setTimeout(close_status_line, 5000);
}

function scroll_current_window(){
    win = $('.messages:not(.invisible)');
    if (win.length > 0)
        win.scrollTop(win[0].scrollHeight);
}
